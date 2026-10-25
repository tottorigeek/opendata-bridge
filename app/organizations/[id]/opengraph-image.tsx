import { listCatalogDatasets, formatRegion, ORG_TYPE_LABEL } from "@/lib/datasets";
import { getOrganization } from "@/lib/organizations";
import { OG_CONTENT_TYPE, OG_SIZE, renderOgCard } from "@/lib/og";

export const alt = "OpenData Bridge の組織";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;
export const revalidate = 3600;

export default async function Image({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const organization = await getOrganization(id);
  if (!organization) {
    return renderOgCard({ label: "組織", title: "OpenData Bridge の組織" });
  }
  // 件数は未ログインの閲覧者から見える(一般公開の)データセットだけを数える。
  const datasets = await listCatalogDatasets(null, { organizationId: id });
  const region = formatRegion({
    prefecture: organization.prefecture,
    municipality: organization.municipality,
  });
  return renderOgCard({
    label: `組織 · ${ORG_TYPE_LABEL[organization.type] ?? ""}`,
    title: organization.name,
    lines: [region ? `所在地: ${region}` : ""],
    chips: [`公開データ ${datasets.length.toLocaleString("ja-JP")} 件`],
  });
}
