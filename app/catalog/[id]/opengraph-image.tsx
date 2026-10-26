import { getCatalogDataset, effectiveRegion, formatRegion } from "@/lib/datasets";
import { detectCoordinateColumns } from "@/lib/geo";
import { OG_CONTENT_TYPE, OG_SIZE, renderOgCard } from "@/lib/og";

export const alt = "OpenData Bridge のデータセット";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;
// タイトルや行数の変更が 1 時間以内に反映されるようにする。
export const revalidate = 3600;

/** columnsJson(列名の配列の JSON)を読む。壊れていれば空。 */
function columnsOf(columnsJson: string): string[] {
  try {
    const parsed: unknown = JSON.parse(columnsJson);
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

export default async function Image({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  // 未ログインの閲覧者として取得する。一般公開のデータセットだけが返るので、
  // 非公開データの URL を推測されても、タイトルが画像経由で漏れることはない。
  const dataset = await getCatalogDataset(id, null);
  if (!dataset) {
    return renderOgCard({ label: "オープンデータ", title: "OpenData Bridge のデータセット" });
  }

  const region = formatRegion(effectiveRegion(dataset));
  const hasMap = detectCoordinateColumns(columnsOf(dataset.columnsJson)) !== null;
  return renderOgCard({
    label: region ? `オープンデータ · ${region}` : "オープンデータ",
    title: dataset.title,
    lines: [
      `提供: ${dataset.organization.name}`,
      dataset.attribution ? `出典: ${dataset.attribution}` : "",
    ],
    chips: [
      `${dataset.rowCount.toLocaleString("ja-JP")} 行`,
      dataset.license,
      hasMap ? "地図あり" : "",
    ],
  });
}
