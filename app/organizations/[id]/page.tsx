import Link from "next/link";
import { notFound } from "next/navigation";
import SiteHeader from "@/components/SiteHeader";
import DatasetCard from "@/components/datasets/DatasetCard";
import { getCurrentUser } from "@/lib/auth";
import { listCatalogDatasets, orgTypeBadge, formatRegion, ORG_TYPE_LABEL } from "@/lib/datasets";
import { getOrganization, isMemberOf } from "@/lib/organizations";

export const dynamic = "force-dynamic";

export default async function OrganizationProfilePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await getCurrentUser();
  const { id } = await params;

  const organization = await getOrganization(id);
  if (!organization) notFound();

  // 可視条件はカタログと同じ規則に任せる。閲覧者が所属していれば
  // その組織の「組織内のみ」のデータもここに出る。
  const datasets = await listCatalogDatasets(user, { organizationId: id });

  const badge = orgTypeBadge(organization.type, organization.verified);
  const region = formatRegion(organization);
  const isOwn = isMemberOf(user, id);

  return (
    <>
      <SiteHeader />
      <main className="flex-1">
        <div className="mx-auto max-w-6xl px-4 py-12">
          <nav className="text-sm text-slate-500">
            <Link href="/organizations" className="hover:text-sky-700">
              組織一覧
            </Link>
            <span className="mx-1.5">/</span>
            <span className="text-slate-700">{organization.name}</span>
          </nav>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span
              title={badge.title}
              className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${badge.className}`}
            >
              {badge.label}
            </span>
            {isOwn && (
              <span className="rounded-full bg-sky-100 px-2.5 py-0.5 text-xs font-medium text-sky-700">
                自組織
              </span>
            )}
          </div>

          <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-900">
            {organization.name}
          </h1>

          <dl className="mt-4 flex flex-wrap gap-x-8 gap-y-2 text-sm">
            <div>
              <dt className="text-xs text-slate-500">種別</dt>
              <dd className="text-slate-800">
                {ORG_TYPE_LABEL[organization.type] ?? organization.type}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-slate-500">所在地</dt>
              <dd className="text-slate-800">{region ?? "未設定"}</dd>
            </div>
            <div>
              <dt className="text-xs text-slate-500">公開データセット</dt>
              <dd className="text-slate-800">
                {datasets.length.toLocaleString("ja-JP")} 件
              </dd>
            </div>
          </dl>

          {!organization.verified && (
            <p className="mt-4 rounded-md border border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-600">
              この組織の種別は登録時の自己申告であり、運営による確認は取れていません。
            </p>
          )}

          <div className="mt-8 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-slate-900">
              公開しているデータ
            </h2>
            <Link
              href={`/catalog?org=${organization.id}`}
              className="text-sm font-medium text-sky-700 hover:text-sky-800"
            >
              カタログで絞り込む
            </Link>
          </div>

          {datasets.length === 0 ? (
            <div className="mt-4 rounded-xl border border-dashed border-slate-300 bg-white p-12 text-center text-slate-600">
              この組織が公開しているデータセットはまだありません。
            </div>
          ) : (
            <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {datasets.map((d) => (
                <DatasetCard key={d.id} dataset={d} showOrganization={false} />
              ))}
            </div>
          )}
        </div>
      </main>
    </>
  );
}
