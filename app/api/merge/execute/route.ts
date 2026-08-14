import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import {
  getAccessibleDataset,
  readDatasetSource,
  buildMergedCsv,
} from "@/lib/merge/datasets";
import { resolveMergedLicense } from "@/lib/merge/license";
import { recordMergeLineage } from "@/lib/merge/lineage";
import {
  DEFAULT_MAX_OUTPUT_ROWS,
  MERGE_KINDS,
  MergeLimitExceededError,
  mergeTables,
} from "@/lib/merge/engine";
import { parseMergeRequest } from "@/lib/merge/request";
import { prisma } from "@/lib/prisma";
import { RATE_LIMITS, consumeRateLimit } from "@/lib/rate-limit";
import { createDatasetVersion, latestVersion } from "@/lib/versions";

/** 入力 1 データセットあたりの最大行数。 */
const MAX_INPUT_ROWS = 200_000;

/**
 * POST /api/merge/execute
 * 全行でマージを実行し、結果を新しい Dataset(MERGED / DRAFT / PRIVATE)として自組織に保存する。
 */
export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "認証が必要です。" }, { status: 401 });
  }

  // 全行マージは重い処理なので、ユーザー単位で実行頻度を絞る。
  const limit = await consumeRateLimit(`merge:${user.id}`, RATE_LIMITS.merge);
  if (!limit.ok) {
    return NextResponse.json(
      {
        error: `マージの実行が多すぎます。${limit.retryAfterSeconds} 秒後に再試行してください。`,
      },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "リクエスト形式が不正です。" }, { status: 400 });
  }

  const parsed = parseMergeRequest(body);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }
  const req = parsed.value;

  const [dsA, dsB] = await Promise.all([
    getAccessibleDataset(user, req.datasetAId),
    getAccessibleDataset(user, req.datasetBId),
  ]);
  if (!dsA || !dsB) {
    return NextResponse.json(
      { error: "指定されたデータセットにアクセスできません。" },
      { status: 403 },
    );
  }

  let sourceA;
  let sourceB;
  try {
    [sourceA, sourceB] = await Promise.all([
      readDatasetSource(dsA),
      readDatasetSource(dsB),
    ]);
  } catch (e) {
    const message = e instanceof Error ? e.message : "CSV の読み込みに失敗しました。";
    return NextResponse.json({ error: message }, { status: 422 });
  }
  const tableA = sourceA.table;
  const tableB = sourceB.table;

  if (!tableA.columns.includes(req.keyA) || !tableB.columns.includes(req.keyB)) {
    return NextResponse.json(
      { error: "指定されたキー列がデータセットに存在しません。" },
      { status: 400 },
    );
  }

  if (tableA.rows.length > MAX_INPUT_ROWS || tableB.rows.length > MAX_INPUT_ROWS) {
    return NextResponse.json(
      {
        error:
          `マージできるのは 1 データセットあたり ${MAX_INPUT_ROWS.toLocaleString()} 行までです。`,
      },
      { status: 413 },
    );
  }

  let result;
  try {
    result = mergeTables(tableA, tableB, {
      keyA: req.keyA,
      keyB: req.keyB,
      level: req.level,
      joinType: req.joinType,
      outputColumns: req.outputColumns,
      datasetNameA: dsA.title,
      datasetNameB: dsB.title,
      maxOutputRows: DEFAULT_MAX_OUTPUT_ROWS,
    });
  } catch (e) {
    if (e instanceof MergeLimitExceededError) {
      return NextResponse.json({ error: e.message }, { status: 413 });
    }
    throw e;
  }

  const rowCount = result.rows.length;
  const matchPct = (result.stats.analysis.a.coverage * 100).toFixed(1);
  const kindLabel =
    MERGE_KINDS.find((k) => k.value === req.kind)?.label ?? req.kind;
  const description =
    `「${dsA.title}」と「${dsB.title}」をマージ` +
    `(${kindLabel}、キー: ${req.keyA} ⇔ ${req.keyB}、正規化: ${req.level}、` +
    `カバー率: ${matchPct}%)`;

  const title = `${dsA.title} × ${dsB.title}(マージ)`;

  // ライセンスは入力から継承する。判定できない組み合わせは未確定のままにし、
  // 公開申請の関門で人に確定させる(既定値を黙って入れない)。
  const license = resolveMergedLicense(dsA.license, dsB.license);

  // 先に Dataset 行を作り、その id をキーに CSV を保存してから filePath を確定する
  // (アップロード経路と同じ「id ベースのストレージキー」に統一する)。
  const created = await prisma.dataset.create({
    data: {
      title,
      description,
      sourceType: "MERGED",
      status: "DRAFT",
      visibility: "PRIVATE",
      filePath: null,
      columnsJson: JSON.stringify(result.columns),
      rowCount,
      license: license.license ?? "",
      licenseUnresolved: license.license === null,
      organizationId: user.organizationId,
    },
  });

  // マージ結果も版として記録する。再マージすれば版が増える。
  await createDatasetVersion({
    datasetId: created.id,
    content: buildMergedCsv(result.columns, result.rows),
    columns: result.columns,
    rowCount,
    source: "MERGE",
    note: `${dsA.title} × ${dsB.title} のマージ結果`,
  });

  // どの版を使ったかを来歴に残す。ピン留め(実装順序 6)はこの番号を参照する。
  const [versionA, versionB] = await Promise.all([
    latestVersion(dsA.id),
    latestVersion(dsB.id),
  ]);

  // 来歴を構造化して保存する。説明文だけでは元データを辿れず、統計も比較できない。
  await recordMergeLineage({
    datasetId: created.id,
    kind: req.kind,
    keyA: req.keyA,
    keyB: req.keyB,
    level: req.level,
    analysis: result.stats.analysis,
    columnOrigins: result.columnOrigins,
    inputs: [
      {
        side: "A",
        dataset: dsA,
        contentHash: sourceA.contentHash,
        versionNumber: versionA?.number ?? null,
      },
      {
        side: "B",
        dataset: dsB,
        contentHash: sourceB.contentHash,
        versionNumber: versionB?.number ?? null,
      },
    ],
  });

  return NextResponse.json({
    ok: true,
    datasetId: created.id,
    title: created.title,
    description: created.description,
    rowCount,
    stats: result.stats,
    license: {
      value: license.license,
      unresolved: license.license === null,
      reason: license.reason,
    },
  });
}
