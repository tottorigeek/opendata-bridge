import Link from "next/link";
import { notFound } from "next/navigation";
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
import { readCsvPreview } from "@/lib/csv";
import CsvPreviewTable from "@/components/datasets/CsvPreviewTable";
import LineagePanel from "@/components/datasets/LineagePanel";
import { getLineage } from "@/lib/merge/lineage";

export const dynamic = "force-dynamic";

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

  const preview = dataset.filePath
    ? await readCsvPreview(dataset.id, 50)
    : { columns: [], rows: [], totalRows: 0 };
  const tags = parseTags(dataset.tags);
  // マージ由来のデータセットは、どの出典から作られたかを併せて示す。
  const lineage =
    dataset.sourceType === "MERGED" ? await getLineage(dataset.id) : null;

  return (
    <>
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
            提供組織: {dataset.organization.name}
          </p>
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
