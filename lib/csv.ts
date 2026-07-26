import "server-only";
import { parse } from "csv-parse/sync";
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

/** 保存済み CSV の生バイト列(ダウンロード用。常に UTF-8 で返す)。 */
export async function readCsvForDownload(datasetId: string): Promise<Buffer | null> {
  const buffer = await readDatasetCsv(datasetId);
  if (!buffer) return null;
  // 元が Shift_JIS でも UTF-8 に正規化して配信する(BOM 付き UTF-8)
  const text = decodeCsvBuffer(buffer);
  return Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from(text, "utf-8")]);
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
