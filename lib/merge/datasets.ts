/**
 * マージ機能で使うデータセットのアクセス制御 & ファイル入出力ヘルパー。
 * 他エージェント領域(app/dashboard/datasets 等)には触れず、ここで完結させる。
 */
import "server-only";
import { createHash } from "node:crypto";
import type { Dataset, Organization } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { SessionUser } from "@/lib/auth";
import { readCsvObject } from "@/lib/storage";
import { parseCsv, toCsv, type CsvTable } from "./csv";

/**
 * マージのソースとして選べるデータセットを返す。
 *   - 自組織の全データセット
 *   - 他組織でも PUBLISHED かつ PUBLIC のデータセット
 */
export async function listMergeableDatasets(user: SessionUser): Promise<Dataset[]> {
  return prisma.dataset.findMany({
    where: {
      OR: [
        { organizationId: user.organizationId },
        { status: "PUBLISHED", visibility: "PUBLIC" },
      ],
    },
    orderBy: { updatedAt: "desc" },
  });
}

/** そのユーザーが当該データセットをマージ入力として読めるか判定する。 */
export function canUseAsMergeSource(user: SessionUser, dataset: Dataset): boolean {
  if (dataset.organizationId === user.organizationId) return true;
  return dataset.status === "PUBLISHED" && dataset.visibility === "PUBLIC";
}

/** id からデータセットを取得しつつアクセス可否を確認する。不可なら null。 */
export async function getAccessibleDataset(
  user: SessionUser,
  datasetId: string,
): Promise<(Dataset & { organization: Organization }) | null> {
  const ds = await prisma.dataset.findUnique({
    where: { id: datasetId },
    // 来歴には発行組織名も写すため、ここで一緒に取っておく。
    include: { organization: true },
  });
  if (!ds) return null;
  if (!canUseAsMergeSource(user, ds)) return null;
  return ds;
}

/**
 * データセットの CSV を読み込み、テーブルと内容ハッシュを返す。
 * filePath 未設定 / 実体が無い場合は例外。
 *
 * ハッシュ(SHA-256)は来歴に記録し、「マージ時点の出典と今の出典が同じか」の
 * 判定に使う。版(バージョン)導入前でも陳腐化を検出できる。
 */
export async function readDatasetSource(
  dataset: Dataset,
): Promise<{ table: CsvTable; contentHash: string }> {
  if (!dataset.filePath) {
    throw new Error(`データセット「${dataset.title}」に CSV ファイルが紐付いていません。`);
  }
  // 版ごとにキーが異なるため、DB に記録された filePath をそのまま使う。
  const buffer = await readCsvObject(dataset.filePath);
  if (!buffer) {
    throw new Error(`データセット「${dataset.title}」の CSV が見つかりません。`);
  }
  return {
    table: parseCsv(buffer.toString("utf8")),
    contentHash: createHash("sha256").update(buffer).digest("hex"),
  };
}

/** データセットの CSV を読み込んでテーブル化する。 */
export async function readDatasetTable(dataset: Dataset): Promise<CsvTable> {
  return (await readDatasetSource(dataset)).table;
}

/** マージ結果の列・行から保存用の CSV 文字列を生成する。 */
export function buildMergedCsv(
  columns: string[],
  rows: Record<string, string>[],
): string {
  return toCsv(columns, rows);
}
