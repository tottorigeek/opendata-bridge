/**
 * マージ API(preview / execute)共通のリクエスト検証。
 */
import type { JoinType, OutputColumn } from "./engine";
import type { NormalizationLevel } from "./normalize";

const LEVELS: NormalizationLevel[] = ["exact", "basic", "kana", "phone", "date", "address"];
const JOINS: JoinType[] = ["inner", "left", "full"];

export type MergeRequest = {
  datasetAId: string;
  datasetBId: string;
  keyA: string;
  keyB: string;
  level: NormalizationLevel;
  joinType: JoinType;
  outputColumns: OutputColumn[];
};

export type ParseResult =
  | { ok: true; value: MergeRequest }
  | { ok: false; error: string };

/** unknown なリクエストボディを検証して MergeRequest にする。 */
export function parseMergeRequest(body: unknown): ParseResult {
  if (typeof body !== "object" || body === null) {
    return { ok: false, error: "リクエスト形式が不正です。" };
  }
  const b = body as Record<string, unknown>;

  const datasetAId = typeof b.datasetAId === "string" ? b.datasetAId : "";
  const datasetBId = typeof b.datasetBId === "string" ? b.datasetBId : "";
  const keyA = typeof b.keyA === "string" ? b.keyA : "";
  const keyB = typeof b.keyB === "string" ? b.keyB : "";
  const level = b.level as NormalizationLevel;
  const joinType = b.joinType as JoinType;

  if (!datasetAId || !datasetBId) {
    return { ok: false, error: "データセットを 2 つ選択してください。" };
  }
  if (datasetAId === datasetBId) {
    return { ok: false, error: "異なるデータセットを選択してください。" };
  }
  if (!keyA || !keyB) {
    return { ok: false, error: "両データセットのキー列を指定してください。" };
  }
  if (!LEVELS.includes(level)) {
    return { ok: false, error: "正規化レベルが不正です。" };
  }
  if (!JOINS.includes(joinType)) {
    return { ok: false, error: "結合タイプが不正です。" };
  }

  let outputColumns: OutputColumn[] = [];
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
    value: { datasetAId, datasetBId, keyA, keyB, level, joinType, outputColumns },
  };
}
