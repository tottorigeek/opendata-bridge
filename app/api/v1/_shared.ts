import "server-only";
import { parse } from "csv-parse/sync";
import type { Dataset, Organization, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { readCsvObject } from "@/lib/storage";
import { getVersion, latestVersion } from "@/lib/versions";

export type DatasetWithOrg = Dataset & { organization: Organization };

/**
 * API キー保有者がアクセスできるデータセットの Prisma where 条件。
 * - 公開データ: status=PUBLISHED かつ visibility=PUBLIC(全組織)
 * - 自組織データ: organizationId が保有者組織(ORG_ONLY/PRIVATE 含む全件)
 */
export function datasetAccessWhere(orgId: string): Prisma.DatasetWhereInput {
  return {
    OR: [
      { status: "PUBLISHED", visibility: "PUBLIC" },
      { organizationId: orgId },
    ],
  };
}

/** カンマ区切りタグ文字列を配列へ。空要素は除去。 */
export function parseTags(tags: string): string[] {
  return tags
    .split(",")
    .map((t) => t.trim())
    .filter((t) => t.length > 0);
}

/** columnsJson を string[] へ。壊れていれば空配列。 */
export function parseColumns(columnsJson: string): string[] {
  try {
    const parsed = JSON.parse(columnsJson);
    if (Array.isArray(parsed)) return parsed.map((c) => String(c));
    return [];
  } catch {
    return [];
  }
}

/** 一覧・詳細共通のメタデータ整形。 */
export function serializeDataset(ds: DatasetWithOrg) {
  return {
    id: ds.id,
    title: ds.title,
    description: ds.description,
    license: ds.license,
    tags: parseTags(ds.tags),
    rowCount: ds.rowCount,
    columns: parseColumns(ds.columnsJson),
    visibility: ds.visibility,
    status: ds.status,
    updateFrequency: ds.updateFrequency,
    sourceType: ds.sourceType,
    organization: {
      name: ds.organization.name,
      type: ds.organization.type,
    },
    createdAt: ds.createdAt.toISOString(),
    updatedAt: ds.updatedAt.toISOString(),
  };
}

/**
 * アクセス可能なデータセットを 1 件取得。権限外・不存在は null。
 */
export async function findAccessibleDataset(
  id: string,
  orgId: string,
): Promise<DatasetWithOrg | null> {
  return prisma.dataset.findFirst({
    where: { AND: [{ id }, datasetAccessWhere(orgId)] },
    include: { organization: true },
  });
}

export type CsvData = { header: string[]; rows: string[][] };

/**
 * CSV を読み込みヘッダ + データ行に分解。ファイル未設定/未存在は null。
 *
 * 実体のキーはデータセット id から一意に決まらない(版ごとに
 * datasets/{id}/v{n}.csv が分かれる)ため、DB に記録された filePath を使う。
 * id からキーを組み立てると、版を持つデータセットの本体を読めない。
 */
export async function readDatasetCsv(
  ds: Dataset,
): Promise<CsvData | null> {
  if (!ds.filePath) return null;
  const buffer = await readCsvObject(ds.filePath);
  if (!buffer) return null;
  const content = buffer.toString("utf8");

  const records = parse(content, {
    skip_empty_lines: true,
    relax_column_count: true,
  }) as string[][];
  if (records.length === 0) return { header: [], rows: [] };
  const [header, ...rows] = records;
  return { header, rows };
}

/** limit / offset をパースしクランプ。 */
export function parsePaging(
  searchParams: URLSearchParams,
  defaultLimit: number,
  maxLimit: number,
): { limit: number; offset: number } {
  const rawLimit = Number(searchParams.get("limit"));
  const rawOffset = Number(searchParams.get("offset"));
  let limit = Number.isFinite(rawLimit) && rawLimit > 0 ? Math.floor(rawLimit) : defaultLimit;
  limit = Math.min(limit, maxLimit);
  const offset = Number.isFinite(rawOffset) && rawOffset > 0 ? Math.floor(rawOffset) : 0;
  return { limit, offset };
}

/** API が返す版の情報。版を持たないデータセットでは null。 */
export type VersionInfo = { number: number; createdAt: string } | null;

/** 最新版の情報。取り込み側が「どの版を取り込んだか」を記録できるようにする。 */
export async function latestVersionInfo(datasetId: string): Promise<VersionInfo> {
  const v = await latestVersion(datasetId);
  return v ? { number: v.number, createdAt: v.createdAt.toISOString() } : null;
}

export type ResolvedCsv = { csv: CsvData; version: VersionInfo };

/**
 * データ本体を読む。version を指定すればその版、省略すれば最新版。
 *
 * 版を指定できるようにしているのは、取り込み側が記録した版番号で
 * あとから同じ内容を取り直せるようにするため(取り込みの再現性)。
 */
export async function readDatasetCsvAtVersion(
  ds: Dataset,
  versionNumber: number | null,
): Promise<ResolvedCsv | null> {
  if (versionNumber === null) {
    const csv = await readDatasetCsv(ds);
    if (!csv) return null;
    return { csv, version: await latestVersionInfo(ds.id) };
  }

  const version = await getVersion(ds.id, versionNumber);
  if (!version) return null;
  const buffer = await readCsvObject(version.filePath);
  if (!buffer) return null;

  const records = parse(buffer.toString("utf8"), {
    skip_empty_lines: true,
    relax_column_count: true,
  }) as string[][];
  const [header = [], ...rows] = records;
  return {
    csv: { header, rows },
    version: { number: version.number, createdAt: version.createdAt.toISOString() },
  };
}
