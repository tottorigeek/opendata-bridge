/**
 * マージ API(preview / execute / affinity)共通のリクエスト検証。
 */
import { joinTypeForKind, type JoinType, type MergeKind, type OutputColumn } from "./engine";
import type { NormalizationLevel } from "./normalize";

const LEVELS: NormalizationLevel[] = ["exact", "basic", "kana", "phone", "date", "address"];
const KINDS: MergeKind[] = ["extend", "intersect"];

export type MergeRequest = {
  datasetAId: string;
  datasetBId: string;
  keyA: string;
  keyB: string;
  level: NormalizationLevel;
  /** 利用者が選んだマージ型。 */
  kind: MergeKind;
  /** kind から導かれる低レベルの結合種別。API からは直接指定できない。 */
  joinType: JoinType;
  outputColumns: OutputColumn[];
};

export type ParseResult<T> = { ok: true; value: T } | { ok: false; error: string };

/** 2 つのデータセット ID を検証する(両 API 共通)。 */
function parseDatasetPair(
  b: Record<string, unknown>,
): ParseResult<{ datasetAId: string; datasetBId: string }> {
  const datasetAId = typeof b.datasetAId === "string" ? b.datasetAId : "";
  const datasetBId = typeof b.datasetBId === "string" ? b.datasetBId : "";

  if (!datasetAId || !datasetBId) {
    return { ok: false, error: "データセットを 2 つ選択してください。" };
  }
  if (datasetAId === datasetBId) {
    return { ok: false, error: "異なるデータセットを選択してください。" };
  }
  return { ok: true, value: { datasetAId, datasetBId } };
}

function asObject(body: unknown): Record<string, unknown> | null {
  if (typeof body !== "object" || body === null) return null;
  return body as Record<string, unknown>;
}

/** unknown なリクエストボディを検証して MergeRequest にする。 */
export function parseMergeRequest(body: unknown): ParseResult<MergeRequest> {
  const b = asObject(body);
  if (!b) return { ok: false, error: "リクエスト形式が不正です。" };

  const pair = parseDatasetPair(b);
  if (!pair.ok) return pair;

  const keyA = typeof b.keyA === "string" ? b.keyA : "";
  const keyB = typeof b.keyB === "string" ? b.keyB : "";
  const level = b.level as NormalizationLevel;
  const kind = b.kind as MergeKind;

  if (!keyA || !keyB) {
    return { ok: false, error: "両データセットのキー列を指定してください。" };
  }
  if (!LEVELS.includes(level)) {
    return { ok: false, error: "正規化レベルが不正です。" };
  }
  if (!KINDS.includes(kind)) {
    return { ok: false, error: "マージ型が不正です。" };
  }

  const outputColumns: OutputColumn[] = [];
  if (Array.isArray(b.outputColumns)) {
    for (const item of b.outputColumns) {
      if (
        item &&
        typeof item === "object" &&
        (item.source === "A" || item.source === "B") &&
        typeof item.column === "string"
      ) {
        outputColumns.push({ source: item.source, column: item.column });
      }
    }
  }

  return {
    ok: true,
    value: {
      ...pair.value,
      keyA,
      keyB,
      level,
      kind,
      joinType: joinTypeForKind(kind),
      outputColumns,
    },
  };
}

export type AffinityRequest = {
  datasetAId: string;
  datasetBId: string;
  kind: MergeKind;
  /**
   * キー列と正規化レベル。3 つとも揃っていれば個別診断、
   * 揃っていなければキー列の推薦モードになる。
   */
  keyA: string | null;
  keyB: string | null;
  level: NormalizationLevel | null;
};

/**
 * 相性チェックのリクエストを検証する。
 * キー列は任意で、未指定なら推薦モードとして扱う。
 */
export function parseAffinityRequest(body: unknown): ParseResult<AffinityRequest> {
  const b = asObject(body);
  if (!b) return { ok: false, error: "リクエスト形式が不正です。" };

  const pair = parseDatasetPair(b);
  if (!pair.ok) return pair;

  const kind = b.kind as MergeKind;
  if (!KINDS.includes(kind)) {
    return { ok: false, error: "マージ型が不正です。" };
  }

  const keyA = typeof b.keyA === "string" && b.keyA ? b.keyA : null;
  const keyB = typeof b.keyB === "string" && b.keyB ? b.keyB : null;
  const level = LEVELS.includes(b.level as NormalizationLevel)
    ? (b.level as NormalizationLevel)
    : null;

  // 一部だけ指定されている状態は、どちらのモードか判断できないため弾く。
  const specified = [keyA, keyB, level].filter((v) => v !== null).length;
  if (specified !== 0 && specified !== 3) {
    return {
      ok: false,
      error: "キー列と正規化レベルは、3 つとも指定するか、すべて省略してください。",
    };
  }

  return { ok: true, value: { ...pair.value, kind, keyA, keyB, level } };
}
