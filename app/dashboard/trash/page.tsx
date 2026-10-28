import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { listTrashedDatasets } from "@/lib/datasets";
import { TrashedDatasetActions } from "@/components/datasets/TrashActions";

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

/** ゴミ箱。元に戻すか、管理者が完全に削除する。 */
export default async function TrashPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const datasets = await listTrashedDatasets(user.organizationId);
  const isAdmin = user.role === "ADMIN";

  return (
    <div>
      <h1 className="text-2xl font-bold text-slate-900">ゴミ箱</h1>
      <p className="mt-1 text-slate-600">
        ゴミ箱に入れたデータセットは、カタログ・API・マージの候補から外れます。
        元に戻すと下書きになり、公開するには承認をやり直します。
        {isAdmin
          ? " 完全に削除すると、保存しているファイル(過去の版を含む)も消え、元に戻せません。"
          : " 完全に削除できるのは組織の管理者です。"}
      </p>

      {datasets.length === 0 ? (
        <div className="mt-8 rounded-xl border border-dashed border-slate-300 bg-white p-10 text-center text-sm text-slate-500">
          ゴミ箱は空です。
        </div>
      ) : (
        <ul className="mt-8 divide-y divide-slate-200 rounded-xl border border-slate-200 bg-white">
          {datasets.map((d) => (
            <li key={d.id} className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <Link
                  href={`/dashboard/datasets/${d.id}`}
                  className="font-medium text-slate-900 hover:text-sky-700 hover:underline"
                >
                  {d.title}
                </Link>
                <p className="mt-0.5 text-xs text-slate-500">
                  {d.rowCount.toLocaleString("ja-JP")} 行
                  {d.trashedAt && ` · ${formatDateTime(d.trashedAt)}にゴミ箱へ移動`}
                </p>
              </div>
              <TrashedDatasetActions id={d.id} title={d.title} isAdmin={isAdmin} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
