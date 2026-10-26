import type { MetadataRoute } from "next";
import { listCatalogDatasets } from "@/lib/datasets";
import { listOrganizations } from "@/lib/organizations";
import { absoluteUrl } from "@/lib/site-metadata";

// DB を読むので、ビルド時ではなくリクエスト時に作る(CI のビルドには DB がない)。
export const dynamic = "force-dynamic";

/**
 * サイトマップ。主要ページと、一般公開のデータセット・組織を載せる。
 * 未ログインの閲覧者として引くので、非公開・組織内限定のデータは載らない。
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [datasets, organizations] = await Promise.all([
    listCatalogDatasets(null),
    listOrganizations(),
  ]);

  const latest = datasets.reduce<Date | undefined>(
    (max, d) => (!max || d.updatedAt > max ? d.updatedAt : max),
    undefined,
  );

  return [
    { url: absoluteUrl("/"), changeFrequency: "weekly", priority: 1 },
    { url: absoluteUrl("/about"), changeFrequency: "monthly", priority: 0.8 },
    { url: absoluteUrl("/catalog"), lastModified: latest, changeFrequency: "daily", priority: 0.9 },
    { url: absoluteUrl("/organizations"), changeFrequency: "weekly", priority: 0.6 },
    ...datasets.map((d) => ({
      url: absoluteUrl(`/catalog/${d.id}`),
      lastModified: d.updatedAt,
      changeFrequency: "daily" as const,
      priority: 0.8,
    })),
    // 公開データのない組織のページは中身が空なので載せない
    ...organizations
      .filter((o) => o.publishedCount > 0)
      .map((o) => ({
        url: absoluteUrl(`/organizations/${o.id}`),
        changeFrequency: "weekly" as const,
        priority: 0.5,
      })),
  ];
}
