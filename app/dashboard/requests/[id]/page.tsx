import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import RequestThread from "@/components/requests/RequestThread";
import { getCurrentUser } from "@/lib/auth";
import {
  REQUEST_KIND_LABEL,
  REQUEST_STATUS_CLASS,
  REQUEST_STATUS_LABEL,
  getVisibleRequest,
} from "@/lib/requests";

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

export default async function RequestDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const { id } = await params;
  const visible = await getVisibleRequest(id, user);
  if (!visible) notFound();

  const { request, isRecipient } = visible;

  return (
    <div>
      <nav className="text-sm text-slate-500">
        <Link href="/dashboard/requests" className="hover:text-sky-700">
          データリクエスト
        </Link>
        <span className="mx-1.5">/</span>
        <span className="text-slate-700">{request.title}</span>
      </nav>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <span
          className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
            REQUEST_STATUS_CLASS[request.status] ?? "bg-slate-100 text-slate-600"
          }`}
        >
          {REQUEST_STATUS_LABEL[request.status] ?? request.status}
        </span>
        <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs text-slate-600">
          {REQUEST_KIND_LABEL[request.kind] ?? request.kind}
        </span>
        <span className="text-xs text-slate-500">
          {isRecipient ? "受け取ったリクエスト" : "送ったリクエスト"}
        </span>
      </div>

      <h1 className="mt-2 text-2xl font-bold text-slate-900">{request.title}</h1>
      <p className="mt-1 text-sm text-slate-500">
        {request.requesterOrgName} の {request.requesterName} さん →{" "}
        <Link
          href={`/organizations/${request.organization.id}`}
          className="text-sky-700 hover:underline"
        >
          {request.organization.name}
        </Link>
        ・{formatDateTime(request.createdAt)}
      </p>

      {request.dataset && (
        <p className="mt-2 text-sm">
          対象データセット:{" "}
          <Link
            href={`/catalog/${request.dataset.id}`}
            className="font-medium text-sky-700 hover:underline"
          >
            {request.dataset.title}
          </Link>
        </p>
      )}

      <div className="mt-6 rounded-xl border border-slate-200 bg-white p-5">
        <p className="whitespace-pre-wrap text-sm text-slate-800">{request.body}</p>
      </div>

      <h2 className="mt-8 font-semibold text-slate-900">
        やりとり({request.replies.length} 件)
      </h2>

      {request.replies.length === 0 ? (
        <p className="mt-3 text-sm text-slate-500">まだ返信はありません。</p>
      ) : (
        <ul className="mt-3 space-y-3">
          {request.replies.map((reply) => (
            <li
              key={reply.id}
              className={`rounded-xl border p-4 ${
                reply.fromOrganization
                  ? "border-sky-200 bg-sky-50"
                  : "border-slate-200 bg-white"
              }`}
            >
              <p className="text-xs text-slate-500">
                {reply.authorName}
                {reply.fromOrganization && (
                  <span className="ml-1 text-sky-700">({request.organization.name})</span>
                )}
                ・{formatDateTime(reply.createdAt)}
              </p>
              <p className="mt-1 whitespace-pre-wrap text-sm text-slate-800">
                {reply.body}
              </p>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-6">
        <RequestThread
          requestId={request.id}
          currentStatus={request.status}
          canChangeStatus={isRecipient}
        />
      </div>
    </div>
  );
}
