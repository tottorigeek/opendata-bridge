/**
 * マージ機能で使うデータセットのアクセス制御 & ファイル入出力ヘルパー。
 * 他エージェント領域(app/dashboard/datasets 等)には触れず、ここで完結させる。
 */
import "server-only";
import type { Dataset } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { SessionUser } from "@/lib/auth";
import { readDatasetCsv } from "@/lib/storage";
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
): Promise<Dataset | null> {
  const ds = await prisma.dataset.findUnique({ where: { id: datasetId } });
  if (!ds) return null;
  if (!canUseAsMergeSource(user, ds)) return null;
  return ds;
}

/** データセットの CSV を読み込んでテーブル化する。filePath 未設定/未存在なら例外。 */
export async function readDatasetTable(dataset: Dataset): Promise<CsvTable> {
  if (!dataset.filePath) {
    throw new Error(`データセット「${dataset.title}」に CSV ファイルが紐付いていません。`);
  }
  const buffer = await readDatasetCsv(dataset.id);
  if (!buffer) {
    throw new Error(`データセット「${dataset.title}」の CSV が見つかりません。`);
  }
  return parseCsv(buffer.toString("utf8"));
}

/** マージ結果の列・行から保存用の CSV 文字列を生成する。 */
export function buildMergedCsv(
  columns: string[],
  rows: Record<string, string>[],
): string {
  return toCsv(columns, rows);
}
