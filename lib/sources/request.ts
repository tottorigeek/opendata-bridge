/**
 * データソース設定 API のリクエスト検証。
 * lib/merge/request.ts と同じ「unknown を受けて判別する」方針で書く。
 */
import type { FieldMapping } from "./transform";

export const SOURCE_KINDS = ["REST_JSON", "CSV_URL"] as const;
export type SourceKindValue = (typeof SOURCE_KINDS)[number];

export const SOURCE_AUTH_TYPES = ["NONE", "BEARER", "HEADER", "QUERY"] as const;
export type SourceAuthTypeValue = (typeof SOURCE_AUTH_TYPES)[number];

export const SYNC_MODES = ["MANUAL", "SCHEDULED"] as const;
export type SyncModeValue = (typeof SYNC_MODES)[number];

export interface SourceConfigRequest {
  kind: SourceKindValue;
  endpoint: string;
  authType: SourceAuthTypeValue;
  authParamName: string;
  /**
   * 認証値の平文。
   * undefined = 「変更しない」(既存の暗号文を維持)、"" = 「クリアする」。
   * 画面側は伏字表示のまま保存できるよう、未入力時はキーごと送らない。
   */
  authValue: string | undefined;
  recordsPath: string;
  fieldMap: FieldMapping[];
  syncMode: SyncModeValue;
}

export type ParseResult =
  | { ok: true; value: SourceConfigRequest }
  | { ok: false; error: string };

function asString(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

/** unknown なリクエストボディを検証して SourceConfigRequest にする。 */
export function parseSourceConfig(body: unknown): ParseResult {
  if (typeof body !== "object" || body === null) {
    return { ok: false, error: "リクエスト形式が不正です。" };
  }
  const b = body as Record<string, unknown>;

  const kind = asString(b.kind) as SourceKindValue;
  if (!(SOURCE_KINDS as readonly string[]).includes(kind)) {
    return { ok: false, error: "取得方式が不正です。" };
  }

  const endpoint = asString(b.endpoint);
  if (!endpoint) {
    return { ok: false, error: "取得先 URL を入力してください。" };
  }
  // 到達可能性(内部アドレス等)の検証は取得時に lib/sources/fetch.ts が行う。
  // ここでは形式だけを弾き、早い段階で入力ミスに気づけるようにする。
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(endpoint);
  } catch {
    return { ok: false, error: "取得先 URL の形式が不正です。" };
  }
  if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
    return {
      ok: false,
      error: "取得先は http:// または https:// で指定してください。",
    };
  }

  const authType = (asString(b.authType) || "NONE") as SourceAuthTypeValue;
  if (!(SOURCE_AUTH_TYPES as readonly string[]).includes(authType)) {
    return { ok: false, error: "認証方式が不正です。" };
  }

  const authParamName = asString(b.authParamName);
  if ((authType === "HEADER" || authType === "QUERY") && !authParamName) {
    return {
      ok: false,
      error:
        authType === "HEADER"
          ? "ヘッダ名を入力してください。"
          : "クエリパラメータ名を入力してください。",
    };
  }

  const authValue =
    b.authValue === undefined ? undefined : String(b.authValue ?? "");

  const syncMode = (asString(b.syncMode) || "MANUAL") as SyncModeValue;
  if (!(SYNC_MODES as readonly string[]).includes(syncMode)) {
    return { ok: false, error: "同期方法が不正です。" };
  }

  const fieldMap: FieldMapping[] = [];
  if (Array.isArray(b.fieldMap)) {
    for (const item of b.fieldMap) {
      if (item && typeof item === "object") {
        const from = asString((item as Record<string, unknown>).from);
        const to = asString((item as Record<string, unknown>).to);
        if (from && to) fieldMap.push({ from, to });
      }
    }
  }

  const toNames = fieldMap.map((m) => m.to);
  if (new Set(toNames).size !== toNames.length) {
    return { ok: false, error: "保存する列名が重複しています。" };
  }

  return {
    ok: true,
    value: {
      kind,
      endpoint,
      authType,
      authParamName,
      authValue,
      recordsPath: asString(b.recordsPath),
      fieldMap,
      syncMode,
    },
  };
}
