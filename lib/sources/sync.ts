import "server-only";
import { stringify } from "csv-stringify/sync";
import type { DataSource } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { decryptSecret } from "@/lib/crypto";
import { createDatasetVersion } from "@/lib/versions";
import { SourceFetchError, safeFetch } from "./fetch";
import {
  SourceTransformError,
  csvToTable,
  jsonToTable,
  parseFieldMap,
  type SourceTable,
} from "./transform";

/**
 * 外部データソースの同期。
 *
 * 取得 → 表に変換 → **既存の CSV ストレージへ書き出す**、という流れ。
 * 最後の一歩をアップロード経路と同じ `saveDatasetCsv(datasetId, ...)` に
 * 揃えているため、カタログ・ダウンロード・マージエンジン・公開 API v1 は
 * 一切変更せずに API 由来のデータセットを扱える。
 * 「CSV アップロード」と「API 取り込み」は、同じ器を埋める 2 つの経路にすぎない。
 */

/** 1 回の同期で保存する最大行数(メモリと保存量の保護)。 */
const MAX_SYNC_ROWS = 500_000;

export interface SyncOutcome {
  ok: boolean;
  rowCount: number;
  columns: string[];
  message: string;
  durationMs: number;
}

/** 認証情報をリクエストヘッダ / クエリに反映した取得先を組み立てる。 */
function buildRequest(source: DataSource): {
  url: string;
  headers: Record<string, string>;
} {
  const headers: Record<string, string> = {};
  let url = source.endpoint;

  if (source.authType === "NONE") return { url, headers };

  // 復号はここでだけ行い、値はリクエスト以外の用途に使わない
  // (ログ・エラーメッセージにも出さない)。
  const secret = decryptSecret(source.authValueEnc);
  if (!secret) return { url, headers };

  switch (source.authType) {
    case "BEARER":
      headers.authorization = `Bearer ${secret}`;
      break;
    case "HEADER":
      if (source.authParamName) headers[source.authParamName] = secret;
      break;
    case "QUERY":
      if (source.authParamName) {
        const parsed = new URL(url);
        parsed.searchParams.set(source.authParamName, secret);
        url = parsed.toString();
      }
      break;
  }

  return { url, headers };
}

/** 取得したバイト列を、種別に応じて表へ変換する。 */
function toTable(source: DataSource, body: Buffer): SourceTable {
  const fieldMap = parseFieldMap(source.fieldMapJson);
  return source.kind === "CSV_URL"
    ? csvToTable(body, fieldMap)
    : jsonToTable(body, source.recordsPath, fieldMap);
}

/**
 * データソースを 1 件同期する。
 *
 * 失敗しても例外は投げず、結果を SyncOutcome で返して DataSource / SyncRun に
 * 記録する(定期実行で 1 件の失敗が他を巻き込まないようにするため)。
 * 失敗時は既存の CSV を残す — 取得できなかったからといって、
 * 公開中のデータを空にしてしまう方が害が大きい。
 */
export async function syncDataSource(
  source: DataSource,
  triggeredBy: "manual" | "scheduled",
): Promise<SyncOutcome> {
  const startedAt = new Date();
  const started = Date.now();

  let outcome: SyncOutcome;
  try {
    const { url, headers } = buildRequest(source);
    const { body } = await safeFetch(url, { headers });
    const table = toTable(source, body);

    if (table.rows.length > MAX_SYNC_ROWS) {
      throw new SourceTransformError(
        `取得行数が上限(${MAX_SYNC_ROWS.toLocaleString()} 行)を超えました。`,
      );
    }

    // 取り込みごとに版を作る。内容が前回と同じなら版は増えない
    // (定期同期のたびに版が積み上がるのを避けるため)。
    const csv = stringify([table.columns, ...table.rows]);
    const version = await createDatasetVersion({
      datasetId: source.datasetId,
      content: csv,
      columns: table.columns,
      rowCount: table.rows.length,
      source: "SYNC",
      note: "外部データソースからの取り込み",
    });

    outcome = {
      ok: true,
      rowCount: table.rows.length,
      columns: table.columns,
      message: version.unchanged
        ? `${table.rows.length.toLocaleString()} 行を取得しましたが、内容に変化がないため版は増えていません。`
        : `${table.rows.length.toLocaleString()} 行を取り込み、第 ${version.number} 版を作成しました。`,
      durationMs: Date.now() - started,
    };
  } catch (e) {
    // 想定内(取得不可・変換不可)は利用者向けメッセージをそのまま見せる。
    // それ以外は内部情報を漏らさないよう一般化する。
    const message =
      e instanceof SourceFetchError || e instanceof SourceTransformError
        ? e.message
        : "同期中に予期しないエラーが発生しました。";
    if (!(e instanceof SourceFetchError || e instanceof SourceTransformError)) {
      console.error("[sync] unexpected error", {
        dataSourceId: source.id,
        error: e,
      });
    }
    outcome = {
      ok: false,
      rowCount: 0,
      columns: [],
      message,
      durationMs: Date.now() - started,
    };
  }

  const status = outcome.ok ? "SUCCESS" : "FAILED";

  await prisma.$transaction([
    prisma.dataSource.update({
      where: { id: source.id },
      data: {
        lastSyncedAt: startedAt,
        lastStatus: status,
        lastMessage: outcome.message,
        ...(outcome.ok ? { lastRowCount: outcome.rowCount } : {}),
      },
    }),
    prisma.syncRun.create({
      data: {
        dataSourceId: source.id,
        status,
        rowCount: outcome.rowCount,
        message: outcome.message,
        triggeredBy,
        startedAt,
        durationMs: outcome.durationMs,
      },
    }),
  ]);

  return outcome;
}

/**
 * 設定を保存する前の接続テスト。
 * 保存も DB 更新もせず、取得と変換だけを試して先頭数行を返す。
 */
export async function previewDataSource(
  source: Pick<
    DataSource,
    | "kind"
    | "endpoint"
    | "authType"
    | "authValueEnc"
    | "authParamName"
    | "recordsPath"
    | "fieldMapJson"
    | "datasetId"
    | "id"
  >,
  sampleRows = 10,
): Promise<{ columns: string[]; rows: string[][]; totalRows: number }> {
  const { url, headers } = buildRequest(source as DataSource);
  const { body } = await safeFetch(url, { headers });
  const table = toTable(source as DataSource, body);
  return {
    columns: table.columns,
    rows: table.rows.slice(0, sampleRows),
    totalRows: table.rows.length,
  };
}
