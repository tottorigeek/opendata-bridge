import type { Dataset, Organization } from "@prisma/client";
import { absoluteUrl } from "@/lib/site-metadata";

/**
 * 検索エンジン向けの構造化データ(schema.org の JSON-LD)。
 *
 * データセットのページに schema.org/Dataset を埋め込むと、Google のデータセット検索
 * (Dataset Search)などがデータセットとして認識できる。
 */

/** ライセンス名から、ライセンス本文の URL を引く。分からないものは名前のまま出す。 */
const LICENSE_URLS: Record<string, string> = {
  "CC-BY-4.0": "https://creativecommons.org/licenses/by/4.0/",
  "CC-BY-SA-4.0": "https://creativecommons.org/licenses/by-sa/4.0/",
  CC0: "https://creativecommons.org/publicdomain/zero/1.0/",
};

/**
 * <script type="application/ld+json"> に入れる文字列にする。
 * 値には第三者が登録したタイトルや説明が入るので、"</script>" で要素を閉じられないよう
 * "<" をエスケープする(JSON としては同じ意味のまま)。
 */
export function toJsonLdScript(data: object): string {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}

export function datasetJsonLd(
  dataset: Dataset & { organization: Organization },
  opts: { region: string | null; tags: string[]; columns: string[]; hasMap: boolean },
) {
  const url = absoluteUrl(`/catalog/${dataset.id}`);
  const publisher = { "@type": "Organization", name: dataset.organization.name };
  // Google は説明文に 50 文字以上を求める。短い説明しかないときは出典の情報で補う。
  const credit = dataset.attribution
    ? `提供: ${dataset.organization.name}。出典: ${dataset.attribution}。`
    : `提供: ${dataset.organization.name}。`;
  const description = [dataset.description.trim(), credit].filter(Boolean).join("\n\n");

  return {
    "@context": "https://schema.org",
    "@type": "Dataset",
    name: dataset.title,
    description,
    url,
    identifier: dataset.id,
    license: LICENSE_URLS[dataset.license] ?? dataset.license,
    isAccessibleForFree: true,
    keywords: opts.tags,
    // 元データの作成者(出典)は人か組織か判別できないため、帰属表示の文字列として渡す
    ...(dataset.attribution ? { creditText: dataset.attribution } : {}),
    creator: publisher,
    publisher,
    ...(opts.region ? { spatialCoverage: { "@type": "Place", name: opts.region } } : {}),
    datePublished: dataset.createdAt.toISOString(),
    dateModified: dataset.updatedAt.toISOString(),
    ...(opts.columns.length > 0 ? { variableMeasured: opts.columns } : {}),
    ...(dataset.filePath
      ? {
          distribution: [
            {
              "@type": "DataDownload",
              encodingFormat: "text/csv",
              contentUrl: absoluteUrl(`/api/datasets/${dataset.id}/download`),
            },
            ...(opts.hasMap
              ? [
                  {
                    "@type": "DataDownload",
                    encodingFormat: "application/geo+json",
                    contentUrl: absoluteUrl(`/api/datasets/${dataset.id}/download?format=geojson`),
                  },
                ]
              : []),
          ],
        }
      : {}),
  };
}

/** トップページ用。サイト名と、カタログ検索の入口を示す。 */
export function websiteJsonLd() {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: "OpenData Bridge",
    url: absoluteUrl("/"),
    inLanguage: "ja",
    potentialAction: {
      "@type": "SearchAction",
      target: `${absoluteUrl("/catalog")}?q={search_term_string}`,
      "query-input": "required name=search_term_string",
    },
  };
}
