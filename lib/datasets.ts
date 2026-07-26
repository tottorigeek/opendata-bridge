import "server-only";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { SessionUser } from "@/lib/auth";

/**
 * データセット管理・公開カタログ用のドメインヘルパー。
 * ラベル定義・選択肢プリセット・タグ処理・認可・カタログ用クエリを集約する。
 */

// ---- ラベル定義(UI 表示用) -------------------------------------------------

export const STATUS_LABEL: Record<string, string> = {
  DRAFT: "下書き",
  PENDING_REVIEW: "承認待ち",
  PUBLISHED: "公開中",
  REJECTED: "差し戻し",
};

export const STATUS_BADGE_CLASS: Record<string, string> = {
  DRAFT: "bg-slate-100 text-slate-600",
  PENDING_REVIEW: "bg-amber-100 text-amber-700",
  PUBLISHED: "bg-emerald-100 text-emerald-700",
  REJECTED: "bg-red-100 text-red-700",
};

export const VISIBILITY_LABEL: Record<string, string> = {
  PUBLIC: "一般公開",
  ORG_ONLY: "組織内のみ",
  PRIVATE: "非公開",
};

export const ORG_TYPE_LABEL: Record<string, string> = {
  GOVERNMENT: "行政",
  PRIVATE: "民間",
};

export const ORG_TYPE_BADGE_CLASS: Record<string, string> = {
  GOVERNMENT: "bg-sky-100 text-sky-700",
  PRIVATE: "bg-violet-100 text-violet-700",
};

// ---- 選択肢プリセット -------------------------------------------------------

/** ライセンス選択肢(自由入力も可)。 */
export const LICENSE_PRESETS: string[] = [
  "CC-BY-4.0",
  "CC0",
  "政府標準利用規約(第2.0版)",
  "CC-BY-SA-4.0",
  "独自ライセンス",
];

/** 更新頻度の選択肢。 */
export const UPDATE_FREQUENCY_PRESETS: string[] = [
  "不定期",
  "リアルタイム",
  "日次",
  "週次",
  "月次",
  "四半期",
  "年次",
  "更新なし",
];

export const VISIBILITY_VALUES = ["PUBLIC", "ORG_ONLY", "PRIVATE"] as const;
export type VisibilityValue = (typeof VISIBILITY_VALUES)[number];

export function isVisibility(v: unknown): v is VisibilityValue {
  return typeof v === "string" && (VISIBILITY_VALUES as readonly string[]).includes(v);
}

// ---- タグ処理 ---------------------------------------------------------------

/** カンマ区切り文字列 → タグ配列(空要素除去・トリム・重複排除)。 */
export function parseTags(raw: string | null | undefined): string[] {
  if (!raw) return [];
  const seen = new Set<string>();
  const result: string[] = [];
  for (const part of raw.split(/[,、]/)) {
    const t = part.trim();
    if (t && !seen.has(t)) {
      seen.add(t);
      result.push(t);
    }
  }
  return result;
}

/** タグ配列 → 保存用のカンマ区切り文字列。 */
export function formatTags(tags: string[]): string {
  return tags.join(",");
}

// ---- 認可ヘルパー -----------------------------------------------------------

/**
 * 指定 ID のデータセットを取得し、閲覧ユーザーと同一組織のものだけ返す。
 * 他組織・存在しない場合は null(=操作不可)。
 */
export async function getOwnedDataset(datasetId: string, user: SessionUser) {
  const dataset = await prisma.dataset.findUnique({
    where: { id: datasetId },
    include: { organization: true },
  });
  if (!dataset) return null;
  if (dataset.organizationId !== user.organizationId) return null;
  return dataset;
}

// ---- 一覧・カタログクエリ ---------------------------------------------------

/** 自組織のデータセット一覧(更新日降順)。 */
export async function listOrgDatasets(organizationId: string) {
  return prisma.dataset.findMany({
    where: { organizationId },
    orderBy: { updatedAt: "desc" },
  });
}

/** 承認待ち(PENDING_REVIEW)一覧。ADMIN の承認画面用。 */
export async function listPendingDatasets(organizationId: string) {
  return prisma.dataset.findMany({
    where: { organizationId, status: "PENDING_REVIEW" },
    orderBy: { updatedAt: "asc" },
    include: { organization: true },
  });
}

export interface CatalogFilters {
  keyword?: string;
  orgType?: "GOVERNMENT" | "PRIVATE";
  tag?: string;
}

/**
 * 公開カタログの可視条件を組み立てる。
 * - 未ログイン: PUBLISHED かつ visibility=PUBLIC のみ
 * - ログイン済み: 上記に加え、自組織の PUBLISHED かつ ORG_ONLY も表示
 */
export function buildCatalogWhere(
  user: SessionUser | null,
  filters: CatalogFilters = {},
): Prisma.DatasetWhereInput {
  const visibilityOr: Prisma.DatasetWhereInput[] = [
    { status: "PUBLISHED", visibility: "PUBLIC" },
  ];
  if (user) {
    visibilityOr.push({
      status: "PUBLISHED",
      visibility: "ORG_ONLY",
      organizationId: user.organizationId,
    });
  }

  const and: Prisma.DatasetWhereInput[] = [{ OR: visibilityOr }];

  const keyword = filters.keyword?.trim();
  if (keyword) {
    and.push({
      OR: [
        { title: { contains: keyword } },
        { description: { contains: keyword } },
        { tags: { contains: keyword } },
      ],
    });
  }

  if (filters.orgType) {
    and.push({ organization: { type: filters.orgType } });
  }

  const tag = filters.tag?.trim();
  if (tag) {
    and.push({ tags: { contains: tag } });
  }

  return { AND: and };
}

/** カタログ用のデータセット取得(可視条件込み)。 */
export async function listCatalogDatasets(
  user: SessionUser | null,
  filters: CatalogFilters = {},
) {
  return prisma.dataset.findMany({
    where: buildCatalogWhere(user, filters),
    orderBy: { updatedAt: "desc" },
    include: { organization: true },
  });
}

/**
 * カタログ詳細用。可視条件を満たす 1 件を取得。閲覧不可なら null。
 */
export async function getCatalogDataset(datasetId: string, user: SessionUser | null) {
  const dataset = await prisma.dataset.findFirst({
    where: {
      AND: [{ id: datasetId }, buildCatalogWhere(user)],
    },
    include: { organization: true },
  });
  return dataset;
}

/** カタログに現れる全データセットからタグ一覧(重複排除・出現頻度順)を作る。 */
export async function collectCatalogTags(
  user: SessionUser | null,
): Promise<string[]> {
  const rows = await prisma.dataset.findMany({
    where: buildCatalogWhere(user),
    select: { tags: true },
  });
  const counts = new Map<string, number>();
  for (const r of rows) {
    for (const t of parseTags(r.tags)) {
      counts.set(t, (counts.get(t) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "ja"))
    .map(([t]) => t);
}
