import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import {
  REQUEST_KIND_LABEL,
  REQUEST_STATUS_CLASS,
  REQUEST_STATUS_LABEL,
  listReceivedRequests,
  listSentRequests,
} from "@/lib/requests";

export const dynamic = "force-dynamic";

function formatDate(d: Date): string {
  return new Intl.DateTimeFormat("ja-JP", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

function StatusBadge({ status }: { status: string }) {
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-xs font-medium ${
        REQUEST_STATUS_CLASS[status] ?? "bg-slate-100 text-slate-600"
      }`}
    >
      {REQUEST_STATUS_LABEL[status] ?? status}
    </span>
  );
}

export default async function RequestsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const [received, sent] = await Promise.all([
    listReceivedRequests(user.organizationId),
    listSentRequests(user.id),
  ]);

  const openCount = received.filter((r) => r.status === "OPEN").length;

  return (
    <div>
      <h1 className="text-2xl font-bold text-slate-900">データリクエスト</h1>
      <p className="mt-1 text-slate-600">
        他組織から届いた公開・修正の依頼と、自分が送った依頼を管理します。
      </p>

      <section className="mt-8">
        <h2 className="font-semibold text-slate-900">
          受け取ったリクエスト
          {openCount > 0 && (
            <span className="ml-2 rounded-full bg-sky-100 px-2 py-0.5 text-xs font-medium text-sky-700">
              未対応 {openCount} 件
            </span>
          )}
        </h2>

        {received.length === 0 ? (
          <p className="mt-3 rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">
            受け取ったリクエストはありません。
          </p>
        ) : (
          <ul className="mt-3 space-y-2">
            {received.map((r) => (
              <li key={r.id}>
                <Link
                  href={`/dashboard/requests/${r.id}`}
                  className="block rounded-xl border border-slate-200 bg-white p-4 transition hover:border-sky-300"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusBadge status={r.status} />
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
                      {REQUEST_KIND_LABEL[r.kind] ?? r.kind}
                    </span>
                    <span className="font-medium text-slate-900">{r.title}</span>
                  </div>
                  <p className="mt-1 text-xs text-slate-500">
                    {r.requesterOrgName} の {r.requesterName} さん・
                    {formatDate(r.createdAt)}
                    {r.dataset && ` ・対象: ${r.dataset.title}`}
                    {r._count.replies > 0 && ` ・返信 ${r._count.replies} 件`}
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-10">
        <h2 className="font-semibold text-slate-900">送ったリクエスト</h2>

        {sent.length === 0 ? (
          <p className="mt-3 rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">
            送ったリクエストはありません。組織ページから送れます。
          </p>
        ) : (
          <ul className="mt-3 space-y-2">
            {sent.map((r) => (
              <li key={r.id}>
                <Link
                  href={`/dashboard/requests/${r.id}`}
                  className="block rounded-xl border border-slate-200 bg-white p-4 transition hover:border-sky-300"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusBadge status={r.status} />
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
                      {REQUEST_KIND_LABEL[r.kind] ?? r.kind}
                    </span>
                    <span className="font-medium text-slate-900">{r.title}</span>
                  </div>
                  <p className="mt-1 text-xs text-slate-500">
                    宛先: {r.organization.name}・{formatDate(r.createdAt)}
                    {r.dataset && ` ・対象: ${r.dataset.title}`}
                    {r._count.replies > 0 && ` ・返信 ${r._count.replies} 件`}
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
