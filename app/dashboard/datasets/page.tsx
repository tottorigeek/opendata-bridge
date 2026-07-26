import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import {
  listOrgDatasets,
  listPendingDatasets,
  STATUS_LABEL,
  STATUS_BADGE_CLASS,
  VISIBILITY_LABEL,
} from "@/lib/datasets";

function formatDate(d: Date): string {
  return new Intl.DateTimeFormat("ja-JP", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

export default async function DatasetsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const datasets = await listOrgDatasets(user.organizationId);
  const pending =
    user.role === "ADMIN" ? await listPendingDatasets(user.organizationId) : [];

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">データセット</h1>
          <p className="mt-1 text-slate-600">
            {user.organization.name} のデータセットを登録・管理します。
          </p>
        </div>
        <Link
          href="/dashboard/datasets/new"
          className="rounded-md bg-sky-600 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-700"
        >
          + 新規作成
        </Link>
      </div>

      {/* ADMIN 向け 承認待ち一覧 */}
      {user.role === "ADMIN" && pending.length > 0 && (
        <div className="mt-8 rounded-xl border border-amber-200 bg-amber-50/60 p-5">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-amber-800">
            承認待ち
            <span className="rounded-full bg-amber-200 px-2 py-0.5 text-xs text-amber-800">
              {pending.length}
            </span>
          </h2>
          <ul className="mt-3 divide-y divide-amber-200/70">
            {pending.map((d) => (
              <li key={d.id} className="flex items-center justify-between py-2">
                <Link
                  href={`/dashboard/datasets/${d.id}`}
                  className="text-sm font-medium text-slate-800 hover:text-sky-700"
                >
                  {d.title}
                </Link>
                <span className="text-xs text-slate-500">
                  {VISIBILITY_LABEL[d.visibility]} · {d.rowCount.toLocaleString("ja-JP")} 行
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {datasets.length === 0 ? (
        <div className="mt-8 rounded-xl border border-dashed border-slate-300 bg-white p-12 text-center">
          <p className="text-slate-600">まだデータセットがありません。</p>
          <p className="mt-1 text-sm text-slate-500">
            CSV をアップロードして最初のデータセットを登録しましょう。
          </p>
          <Link
            href="/dashboard/datasets/new"
            className="mt-4 inline-block rounded-md bg-sky-600 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-700"
          >
            + 新規作成
          </Link>
        </div>
      ) : (
        <div className="mt-8 overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-4 py-3 text-left font-semibold text-slate-600">
                  タイトル
                </th>
                <th className="px-4 py-3 text-left font-semibold text-slate-600">
                  ステータス
                </th>
                <th className="px-4 py-3 text-left font-semibold text-slate-600">
                  公開範囲
                </th>
                <th className="px-4 py-3 text-right font-semibold text-slate-600">
                  行数
                </th>
                <th className="px-4 py-3 text-left font-semibold text-slate-600">
                  更新日
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {datasets.map((d) => (
                <tr key={d.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3">
                    <Link
                      href={`/dashboard/datasets/${d.id}`}
                      className="font-medium text-slate-800 hover:text-sky-700"
                    >
                      {d.title}
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                        STATUS_BADGE_CLASS[d.status]
                      }`}
                    >
                      {STATUS_LABEL[d.status]}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                    {VISIBILITY_LABEL[d.visibility]}
                  </td>
                  <td className="px-4 py-3 text-right text-slate-600">
                    {d.rowCount.toLocaleString("ja-JP")}
                  </td>
                  <td className="px-4 py-3 text-slate-500">
                    {formatDate(d.updatedAt)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
