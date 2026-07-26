/**
 * マージエンジン専用の CSV ユーティリティ(自前実装)。
 * 他エージェント領域(lib/csv.ts)に依存しないため、ここで完結させる。
 * 導入済みの csv-parse / csv-stringify を利用する。
 */
import { parse } from "csv-parse/sync";
import { stringify } from "csv-stringify/sync";

export type CsvTable = {
  /** ヘッダー(列名)配列。 */
  columns: string[];
  /** データ行。各行は列名→値のレコード。 */
  rows: Record<string, string>[];
};

/**
 * CSV 文字列をパースする。1 行目をヘッダーとして扱う。
 * BOM は除去する。全セルは文字列として読み込む。
 */
export function parseCsv(content: string): CsvTable {
  const text = content.replace(/^﻿/, "");
  const records = parse(text, {
    columns: true,
    skip_empty_lines: true,
    relax_column_count: true,
    trim: false,
  }) as Record<string, string>[];

  // ヘッダーは最初のレコードのキー順から取得する。空ファイルなら空配列。
  const columns = records.length > 0 ? Object.keys(records[0]) : [];
  return { columns, rows: records };
}

/**
 * 列順とデータ行から CSV 文字列を生成する。値が undefined の場合は空文字にする。
 */
export function toCsv(columns: string[], rows: Record<string, string>[]): string {
  const data = rows.map((row) => columns.map((c) => row[c] ?? ""));
  return stringify([columns, ...data]);
}
