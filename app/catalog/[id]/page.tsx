import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { baseOpenGraph } from "@/lib/site-metadata";
import SiteHeader from "@/components/SiteHeader";
import { getCurrentUser } from "@/lib/auth";
import {
  getCatalogDataset,
  parseTags,
  orgTypeBadge,
  effectiveRegion,
  formatRegion,
  VISIBILITY_LABEL,
} from "@/lib/datasets";
import { readCsvTable, toCsvPreview } from "@/lib/csv";
import { detectCoordinateColumns, toMapPoints } from "@/lib/geo";
import CsvPreviewTable from "@/components/datasets/CsvPreviewTable";
import DatasetMapLoader from "@/components/datasets/DatasetMapLoader";
import LineagePanel from "@/components/datasets/LineagePanel";
import { getLineage } from "@/lib/merge/lineage";
import { datasetJsonLd, toJsonLdScript } from "@/lib/structured-data";

export const dynamic = "force-dynamic";

/** 説明文の先頭を、共有カード向けの 1 段落に縮める。 */
function summarize(text: string, max = 120): string {
  const flat = text.replace(/\s+/g, " ").trim();
  const chars = [...flat];
  return chars.length > max ? `${chars.slice(0, max - 1).join("")}…` : flat;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const dataset = await getCatalogDataset(id, await getCurrentUser());
  if (!dataset) return { title: "データセットが見つかりません — OpenData Bridge" };

  const title = `${dataset.title} — OpenData Bridge`;
  const credit = dataset.attribution
    ? `提供: ${dataset.organization.name} / 出典: ${dataset.attribution}`
    : `提供: ${dataset.organization.name}`;
  const description = summarize(
    dataset.description ? `${dataset.description} (${credit})` : credit,
  );
  // OGP 画像は同じ階層の opengraph-image.tsx が自動で付ける。
  return {
    title,
    description,
    alternates: { canonical: `/catalog/${dataset.id}` },
    openGraph: { ...baseOpenGraph, title, description, url: `/catalog/${dataset.id}` },
  };
}

function formatDateTime(d: Date): string {
  return new Intl.DateTimeFormat("ja-JP", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

export default async function CatalogDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await getCurrentUser();
  const { id } = await params;
  const dataset = await getCatalogDataset(id, user);
  if (!dataset) notFound();

  const table = dataset.filePath
    ? await readCsvTable(dataset.id)
    : { columns: [], rows: [] };
  const preview = toCsvPreview(table, 50);
  // 緯度・経度の列があれば地図を出し、GeoJSON でも配る。
  const coordinateColumns = detectCoordinateColumns(table.columns);
  const map = coordinateColumns
    ? toMapPoints(table.columns, table.rows, coordinateColumns)
    : null;
  const tags = parseTags(dataset.tags);
  // マージ由来のデータセットは、どの出典から作られたかを併せて示す。
  const lineage =
    dataset.sourceType === "MERGED" ? await getLineage(dataset.id) : null;
  // 検索エンジン向けの構造化データ。一般公開のデータセットだけに付ける
  // (組織内限定のデータを閲覧中のメンバーのページにも出るが、検索エンジンには届かない)。
  const jsonLd =
    dataset.visibility === "PUBLIC"
      ? toJsonLdScript(
          datasetJsonLd(dataset, {
            region: formatRegion(effectiveRegion(dataset)),
            tags,
            columns: table.columns,
            hasMap: !!map && map.points.length > 0,
          }),
        )
      : null;

  return (
    <>
      {jsonLd && (
        // toJsonLdScript が "<" をエスケープしているので、値に "</script>" が含まれても要素は閉じない
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd }} />
      )}
      <SiteHeader />
      <main className="flex-1">
        <div className="mx-auto max-w-5xl px-4 py-12">
          <nav className="text-sm text-slate-500">
            <Link href="/catalog" className="hover:text-sky-700">
              公開データカタログ
            </Link>
            <span className="mx-1.5">/</span>
            <span className="text-slate-700">{dataset.title}</span>
          </nav>

          <div className="mt-3 flex items-center gap-2">
            {(() => {
              const badge = orgTypeBadge(
                dataset.organization.type,
                dataset.organization.verified,
              );
              return (
                <span
                  title={badge.title}
                  className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${badge.className}`}
                >
                  {badge.label}
                </span>
              );
            })()}
            {dataset.visibility === "ORG_ONLY" && (
              <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs text-slate-500">
                {VISIBILITY_LABEL[dataset.visibility]}
              </span>
            )}
          </div>

          <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-900">
            {dataset.title}
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            提供組織:{" "}
            <Link
              href={`/organizations/${dataset.organization.id}`}
              className="font-medium text-sky-700 hover:underline"
            >
              {dataset.organization.name}
            </Link>
          </p>
          {dataset.attribution && (
            <p className="mt-0.5 text-sm text-slate-500">
              出典:{" "}
              {dataset.attributionUrl ? (
                <a
                  href={dataset.attributionUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-medium text-sky-700 hover:underline"
                >
                  {dataset.attribution}
                </a>
              ) : (
                <span className="font-medium text-slate-700">{dataset.attribution}</span>
              )}
            </p>
          )}
          {dataset.description && (
            <p className="mt-4 max-w-3xl whitespace-pre-wrap text-slate-700">
              {dataset.description}
            </p>
          )}

          <div className="mt-6 flex flex-wrap gap-3">
            {dataset.filePath && (
              <a
                href={`/api/datasets/${dataset.id}/download`}
                className="rounded-md bg-sky-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-sky-700"
              >
                CSV をダウンロード
              </a>
            )}
            {map && map.points.length > 0 && (
              <a
                href={`/api/datasets/${dataset.id}/download?format=geojson`}
                className="rounded-md border border-sky-600 px-5 py-2.5 text-sm font-semibold text-sky-700 hover:bg-sky-50"
              >
                GeoJSON をダウンロード
              </a>
            )}
            {/* 自組織のデータをカタログから開いたときの編集の入口(管理画面と同じ編集画面へ) */}
            {user?.organizationId === dataset.organizationId && (
              <Link
                href={`/dashboard/datasets/${dataset.id}/edit`}
                className="rounded-md border border-slate-300 bg-white px-5 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                編集
              </Link>
            )}
          </div>

          {/* メタデータ */}
          <dl className="mt-8 grid gap-x-8 gap-y-4 rounded-xl border border-slate-200 bg-white p-6 sm:grid-cols-2">
            <div>
              <dt className="text-xs font-medium text-slate-500">対象地域</dt>
              <dd className="mt-0.5 text-sm text-slate-800">
                {(() => {
                  const region = effectiveRegion(dataset);
                  const label = formatRegion(region);
                  if (!label) return "未設定";
                  return (
                    <>
                      {label}
                      {region.inherited && (
                        <span className="ml-1 text-xs text-slate-500">
                          (提供組織の所在地)
                        </span>
                      )}
                    </>
                  );
                })()}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-slate-500">ライセンス</dt>
              <dd className="mt-0.5 text-sm text-slate-800">{dataset.license}</dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-slate-500">更新頻度</dt>
              <dd className="mt-0.5 text-sm text-slate-800">
                {dataset.updateFrequency}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-slate-500">行数</dt>
              <dd className="mt-0.5 text-sm text-slate-800">
                {dataset.rowCount.toLocaleString("ja-JP")} 行
              </dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-slate-500">最終更新</dt>
              <dd className="mt-0.5 text-sm text-slate-800">
                {formatDateTime(dataset.updatedAt)}
              </dd>
            </div>
            <div className="sm:col-span-2">
              <dt className="text-xs font-medium text-slate-500">タグ</dt>
              <dd className="mt-1 flex flex-wrap gap-1.5">
                {tags.length > 0 ? (
                  tags.map((t) => (
                    <Link
                      key={t}
                      href={`/catalog?tag=${encodeURIComponent(t)}`}
                      className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs text-slate-600 hover:bg-slate-200"
                    >
                      {t}
                    </Link>
                  ))
                ) : (
                  <span className="text-sm text-slate-400">なし</span>
                )}
              </dd>
            </div>
          </dl>

          {lineage && (
            <div className="mt-8">
              <LineagePanel lineage={lineage} linkBase="/catalog" />
            </div>
          )}

          {map && map.points.length > 0 && (
            <div className="mt-8">
              <h2 className="mb-3 text-lg font-semibold text-slate-900">地図</h2>
              <DatasetMapLoader points={map.points} />
              <p className="mt-2 text-xs text-slate-500">
                {map.points.length.toLocaleString("ja-JP")} 地点を表示
                {map.skipped > 0 &&
                  `(座標のない・読めない ${map.skipped.toLocaleString("ja-JP")} 行は除く)`}
                {map.truncated > 0 &&
                  `。表示上限のため ${map.truncated.toLocaleString("ja-JP")} 地点は省略`}
                。点を選ぶと内容を表示します。背景地図: 国土地理院
              </p>
            </div>
          )}

          {/* プレビュー */}
          <div className="mt-8">
            <h2 className="mb-3 text-lg font-semibold text-slate-900">
              データプレビュー
            </h2>
            <CsvPreviewTable
              columns={preview.columns}
              rows={preview.rows}
              totalRows={preview.totalRows}
              shown={preview.rows.length}
            />
          </div>
        </div>
      </main>
    </>
  );
}
