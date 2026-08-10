import "server-only";
import { decodeCsvBuffer, parseCsvRows } from "@/lib/csv";

/**
 * 外部レスポンス → 表(列名 + 行)への変換。
 *
 * 最終的に既存の CSV ストレージへ書き出すため、ここでの出力は
 * アップロードされた CSV と同じ「文字列の 2 次元データ」に揃える。
 * これにより下流(カタログ・マージ・公開 API)は取り込み元を意識しない。
 */

export interface FieldMapping {
  /** 取得元のキー(JSON のキー / CSV の列名)。 */
  from: string;
  /** 保存する列名。 */
  to: string;
}

export interface SourceTable {
  columns: string[];
  rows: string[][];
}

/** 変換に失敗したことを表すエラー(利用者向けメッセージを持つ)。 */
export class SourceTransformError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SourceTransformError";
  }
}

/** fieldMapJson を FieldMapping[] に読み解く。壊れていれば空配列。 */
export function parseFieldMap(json: string): FieldMapping[] {
  try {
    const parsed = JSON.parse(json);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (m): m is FieldMapping =>
          !!m &&
          typeof m === "object" &&
          typeof m.from === "string" &&
          typeof m.to === "string" &&
          m.from.length > 0 &&
          m.to.length > 0,
      )
      .map((m) => ({ from: m.from, to: m.to }));
  } catch {
    return [];
  }
}

/**
 * ドット区切りパスで JSON を辿る(例: "result.records")。
 * 空文字ならルートをそのまま返す。
 */
function walkPath(root: unknown, path: string): unknown {
  if (!path) return root;
  let current = root;
  for (const segment of path.split(".")) {
    if (current === null || typeof current !== "object") return undefined;
    current = (current as Record<string, unknown>)[segment];
  }
  return current;
}

/**
 * セル 1 つ分の値を文字列にする。
 * ネストしたオブジェクト・配列は JSON 文字列として保持する(情報を捨てない)。
 */
function toCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

/**
 * JSON レスポンスからレコード配列を取り出して表にする。
 *
 * @param raw       レスポンス本文
 * @param recordsPath 配列の場所(例: "result.records")。空ならルートが配列。
 * @param fieldMap  列マッピング。空なら全レコードのキーの和集合を列にする。
 */
export function jsonToTable(
  raw: Buffer,
  recordsPath: string,
  fieldMap: FieldMapping[],
): SourceTable {
  let parsed: unknown;
  try {
    parsed = JSON.parse(decodeCsvBuffer(raw));
  } catch {
    throw new SourceTransformError(
      "レスポンスを JSON として解析できませんでした。取得先とレコード位置を確認してください。",
    );
  }

  const located = walkPath(parsed, recordsPath);
  if (!Array.isArray(located)) {
    throw new SourceTransformError(
      recordsPath
        ? `レコード位置「${recordsPath}」に配列が見つかりませんでした。`
        : "レスポンス直下が配列ではありません。レコード位置(例: result.records)を指定してください。",
    );
  }

  const records = located.filter(
    (r): r is Record<string, unknown> => !!r && typeof r === "object" && !Array.isArray(r),
  );

  if (records.length === 0) {
    // 0 件は異常ではない(条件に合うデータが無いだけ)。列だけ決めて空表を返す。
    const columns = fieldMap.length > 0 ? fieldMap.map((m) => m.to) : [];
    return { columns, rows: [] };
  }

  if (fieldMap.length > 0) {
    return {
      columns: fieldMap.map((m) => m.to),
      rows: records.map((rec) => fieldMap.map((m) => toCell(rec[m.from]))),
    };
  }

  // マッピング未指定時は、出現順を保った全キーの和集合を列にする
  // (レコードごとにキーが欠けても列がずれないようにする)。
  const columns: string[] = [];
  const seen = new Set<string>();
  for (const rec of records) {
    for (const key of Object.keys(rec)) {
      if (!seen.has(key)) {
        seen.add(key);
        columns.push(key);
      }
    }
  }

  return {
    columns,
    rows: records.map((rec) => columns.map((col) => toCell(rec[col]))),
  };
}

/**
 * CSV レスポンスを表にする。
 * fieldMap を指定した場合は、ヘッダー名で列を選び直す(存在しない列は空欄)。
 */
export function csvToTable(raw: Buffer, fieldMap: FieldMapping[]): SourceTable {
  const rows = parseCsvRows(decodeCsvBuffer(raw));
  if (rows.length === 0) {
    return { columns: fieldMap.map((m) => m.to), rows: [] };
  }

  const header = rows[0].map((c) => c.trim());
  const dataRows = rows.slice(1);

  if (fieldMap.length === 0) {
    return { columns: header, rows: dataRows };
  }

  const indexes = fieldMap.map((m) => header.indexOf(m.from));
  const missing = fieldMap.filter((_, i) => indexes[i] === -1).map((m) => m.from);
  if (missing.length === fieldMap.length) {
    throw new SourceTransformError(
      `指定した取得元の列がヘッダーに見つかりませんでした: ${missing.join(", ")}`,
    );
  }

  return {
    columns: fieldMap.map((m) => m.to),
    rows: dataRows.map((row) =>
      indexes.map((idx) => (idx === -1 ? "" : (row[idx] ?? ""))),
    ),
  };
}
