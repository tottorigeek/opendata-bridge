import "server-only";
import { parse } from "csv-parse/sync";
import { stringify } from "csv-stringify/sync";
import {
  saveDatasetCsv,
  readDatasetCsv,
  deleteDatasetCsv,
  datasetStorageKey,
} from "./storage";

/**
 * CSV 関連ユーティリティ。
 * アップロードされた CSV は UTF-8 / Shift_JIS の双方に対応してデコードし、
 * ヘッダー行(カラム名)と行数を抽出する。ファイル実体の読み書きは lib/storage.ts
 * (ローカル or Vercel Blob)へ委譲し、DB の filePath はストレージキーを保持する。
 */

/** DB に保存するストレージキー(datasets/{id}.csv)。 */
export function datasetRelativePath(datasetId: string): string {
  return datasetStorageKey(datasetId);
}

/**
 * バイト列を UTF-8 か Shift_JIS か判定してデコードする。
 * まず UTF-8 を fatal モードで試し、失敗したら Shift_JIS とみなして変換する。
 * 先頭の BOM(EF BB BF)は除去する。
 */
export function decodeCsvBuffer(buffer: Buffer): string {
  // UTF-8 BOM を除去
  let buf = buffer;
  if (buf.length >= 3 && buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf) {
    buf = buf.subarray(3);
  }

  try {
    // 不正な UTF-8 シーケンスがあれば例外 → Shift_JIS とみなす
    const text = new TextDecoder("utf-8", { fatal: true }).decode(buf);
    return text;
  } catch {
    // Shift_JIS(CP932 相当)としてデコード
    return new TextDecoder("shift_jis").decode(buf);
  }
}

/**
 * Excel / LibreOffice が数式として解釈し始めるセルの先頭文字。
 * タブ・CR も、前置されると後続の = 等が数式扱いになるため含める。
 */
const FORMULA_TRIGGER = /^[=+\-@\t\r]/;

/** 符号付き数値・指数表記(-1.5, +3, 1e-4 など)。 */
const NUMERIC_CELL = /^[+-]?(\d+(\.\d+)?|\.\d+)([eE][+-]?\d+)?$/;

/**
 * CSV 数式インジェクション(Formula Injection)対策。
 *
 * `=cmd|'/c calc'!A1` のようなセルを含む CSV を配信すると、受け取った利用者が
 * Excel で開いた時点で数式として実行される。本システムは組織間でデータを
 * 持ち寄って相互にダウンロードする前提なので、投稿側から取得側への攻撃経路になる。
 * 危険な先頭文字を持つセルにシングルクォートを前置して、文字列として扱わせる。
 *
 * ただし `-1.5` のような負数は正当なデータなので、数値として解釈できるセルは
 * そのまま通す(気温・増減など負数を含むオープンデータを壊さないため)。
 */
export function sanitizeCsvCell(value: string): string {
  if (!value) return value;
  if (!FORMULA_TRIGGER.test(value)) return value;
  if (NUMERIC_CELL.test(value)) return value;
  return `'${value}`;
}

/** 2 次元配列の全セルに数式インジェクション対策を適用する。 */
export function sanitizeCsvRows(rows: string[][]): string[][] {
  return rows.map((row) => row.map((cell) => sanitizeCsvCell(cell)));
}

/** デコード済み CSV 文字列を 2 次元配列にパースする。 */
export function parseCsvRows(content: string): string[][] {
  const rows = parse(content, {
    columns: false,
    skip_empty_lines: true,
    relax_column_count: true,
    bom: true,
    trim: false,
  }) as string[][];
  return rows;
}

export interface CsvMeta {
  columns: string[];
  rowCount: number;
}

/**
 * CSV バッファからヘッダー(カラム名)とデータ行数を抽出する。
 * 1 行目をヘッダーとみなし、rowCount はヘッダーを除いたデータ行数。
 */
export function extractCsvMeta(buffer: Buffer): CsvMeta {
  const content = decodeCsvBuffer(buffer);
  const rows = parseCsvRows(content);
  if (rows.length === 0) {
    return { columns: [], rowCount: 0 };
  }
  const columns = rows[0].map((c) => c.trim());
  const rowCount = Math.max(0, rows.length - 1);
  return { columns, rowCount };
}

export interface CsvPreview {
  columns: string[];
  rows: string[][];
  totalRows: number;
}

/**
 * 保存済み CSV ファイルの先頭 N 行(既定 50)を読み出してプレビュー用に返す。
 * ファイルが存在しない場合は空プレビューを返す。
 */
export async function readCsvPreview(
  datasetId: string,
  limit = 50,
): Promise<CsvPreview> {
  const buffer = await readDatasetCsv(datasetId);
  if (!buffer) {
    return { columns: [], rows: [], totalRows: 0 };
  }
  const content = decodeCsvBuffer(buffer);
  const rows = parseCsvRows(content);
  if (rows.length === 0) {
    return { columns: [], rows: [], totalRows: 0 };
  }
  const columns = rows[0].map((c) => c.trim());
  const dataRows = rows.slice(1);
  return {
    columns,
    rows: dataRows.slice(0, limit),
    totalRows: dataRows.length,
  };
}

/**
 * 保存済み CSV の生バイト列(ダウンロード用。常に UTF-8 で返す)。
 * 配信前に数式インジェクション対策を通すため、一度パースして組み立て直す。
 */
export async function readCsvForDownload(datasetId: string): Promise<Buffer | null> {
  const buffer = await readDatasetCsv(datasetId);
  if (!buffer) return null;
  // 元が Shift_JIS でも UTF-8 に正規化して配信する(BOM 付き UTF-8)
  const text = decodeCsvBuffer(buffer);
  const body = stringify(sanitizeCsvRows(parseCsvRows(text)));
  return Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from(body, "utf-8")]);
}

/** アップロードされたバッファを storage に保存する(UTF-8 に正規化して保存)。 */
export async function saveCsvFile(datasetId: string, buffer: Buffer): Promise<void> {
  const text = decodeCsvBuffer(buffer);
  await saveDatasetCsv(datasetId, text);
}

/** storage から CSV を削除する(存在しなくてもエラーにしない)。 */
export async function deleteCsvFile(datasetId: string): Promise<void> {
  await deleteDatasetCsv(datasetId);
}
