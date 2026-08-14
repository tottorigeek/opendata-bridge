import Link from "next/link";
import SiteHeader from "@/components/SiteHeader";
import { orgTypeBadge, formatRegion } from "@/lib/datasets";
import { listOrganizations } from "@/lib/organizations";

export const dynamic = "force-dynamic";

export default async function OrganizationsPage() {
  const organizations = await listOrganizations();

  return (
    <>
      <SiteHeader />
      <main className="flex-1">
        <div className="mx-auto max-w-6xl px-4 py-12">
          <h1 className="text-2xl font-bold text-slate-900">組織一覧</h1>
          <p className="mt-2 text-slate-600">
            この基盤にデータを持ち寄っている行政・民間の組織です。
            組織を選ぶと、その組織が公開しているデータをまとめて見られます。
          </p>

          <p className="mt-6 text-sm text-slate-500">
            {organizations.length.toLocaleString("ja-JP")} 組織
          </p>

          {organizations.length === 0 ? (
            <div className="mt-4 rounded-xl border border-dashed border-slate-300 bg-white p-12 text-center text-slate-600">
              まだ登録されている組織がありません。
            </div>
          ) : (
            <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {organizations.map((org) => {
                const badge = orgTypeBadge(org.type, org.verified);
                const region = formatRegion(org);
                return (
                  <Link
                    key={org.id}
                    href={`/organizations/${org.id}`}
                    className="flex flex-col rounded-xl border border-slate-200 bg-white p-5 transition hover:border-sky-300 hover:shadow-sm"
                  >
                    <span
                      title={badge.title}
                      className={`self-start rounded-full px-2 py-0.5 text-xs font-medium ${badge.className}`}
                    >
                      {badge.label}
                    </span>
                    <h2 className="mt-2 font-semibold text-slate-900">{org.name}</h2>
                    <p className="mt-1 flex-1 text-sm text-slate-500">
                      {region ?? "所在地未設定"}
                    </p>
                    <p className="mt-3 text-xs text-slate-400">
                      公開データセット {org.publishedCount.toLocaleString("ja-JP")} 件
                    </p>
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      </main>
    </>
  );
}
