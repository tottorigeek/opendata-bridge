import Link from "next/link";
import { redirect } from "next/navigation";
import NotificationActions from "@/components/notifications/NotificationActions";
import { getCurrentUser } from "@/lib/auth";
import { NOTIFICATION_TYPE_LABEL, listNotifications } from "@/lib/notifications";

export const dynamic = "force-dynamic";

function formatDateTime(d: Date): string {
  return new Intl.DateTimeFormat("ja-JP", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

export default async function NotificationsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const notifications = await listNotifications(user.id);
  const unreadCount = notifications.filter((n) => n.readAt === null).length;
  const readCount = notifications.length - unreadCount;

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">通知</h1>
          <p className="mt-1 text-slate-600">
            データリクエストの受信・返信・状態変更をお知らせします。
          </p>
        </div>
        <NotificationActions unreadCount={unreadCount} readCount={readCount} />
      </div>

      {notifications.length === 0 ? (
        <p className="mt-8 rounded-xl border border-dashed border-slate-300 bg-white p-12 text-center text-sm text-slate-500">
          通知はありません。
        </p>
      ) : (
        <ul className="mt-6 space-y-2">
          {notifications.map((n) => (
            <li key={n.id}>
              <Link
                href={n.link}
                className={`block rounded-xl border p-4 transition hover:border-sky-300 ${
                  n.readAt === null
                    ? "border-sky-200 bg-sky-50"
                    : "border-slate-200 bg-white"
                }`}
              >
                <div className="flex flex-wrap items-center gap-2">
                  {n.readAt === null && (
                    <span className="h-2 w-2 shrink-0 rounded-full bg-sky-500" />
                  )}
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
                    {NOTIFICATION_TYPE_LABEL[n.type] ?? n.type}
                  </span>
                  <span className="font-medium text-slate-900">{n.title}</span>
                </div>
                {n.body && <p className="mt-1 text-sm text-slate-600">{n.body}</p>}
                <p className="mt-1 text-xs text-slate-400">
                  {formatDateTime(n.createdAt)}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
