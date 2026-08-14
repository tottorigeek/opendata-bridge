import "server-only";
import type { Organization } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { SessionUser } from "@/lib/auth";

/**
 * 組織ディレクトリ用のヘルパー。
 *
 * 「どの組織が何を出しているか」を一箇所で示すためのもの。
 * データセットの可視条件は lib/datasets.ts の buildCatalogWhere に任せ、
 * ここでは組織そのものの取得と公開件数の集計だけを行う。
 */

export interface OrganizationSummary {
  id: string;
  name: string;
  type: string;
  verified: boolean;
  prefecture: string | null;
  municipality: string | null;
  /** 一般公開(PUBLISHED かつ PUBLIC)のデータセット数。 */
  publishedCount: number;
}

/** 公開データ数の多い順に組織を返す。件数が同じなら名前順。 */
export async function listOrganizations(): Promise<OrganizationSummary[]> {
  const organizations = await prisma.organization.findMany({
    include: {
      _count: {
        select: {
          // 未ログインの利用者から見える件数に揃える。組織内限定は数えない。
          datasets: { where: { status: "PUBLISHED", visibility: "PUBLIC" } },
        },
      },
    },
  });

  return organizations
    .map((org) => ({
      id: org.id,
      name: org.name,
      type: org.type,
      verified: org.verified,
      prefecture: org.prefecture,
      municipality: org.municipality,
      publishedCount: org._count.datasets,
    }))
    .sort(
      (a, b) =>
        b.publishedCount - a.publishedCount || a.name.localeCompare(b.name, "ja"),
    );
}

/** 組織 1 件を取得する。存在しなければ null。 */
export async function getOrganization(id: string): Promise<Organization | null> {
  return prisma.organization.findUnique({ where: { id } });
}

/** 閲覧者がその組織に所属しているか(組織内限定データの表示可否に使う)。 */
export function isMemberOf(user: SessionUser | null, organizationId: string): boolean {
  return user?.organizationId === organizationId;
}
