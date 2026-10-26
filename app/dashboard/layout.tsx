import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import DashboardSidebar from "@/components/DashboardSidebar";
import { countUnread } from "@/lib/notifications";

const ORG_TYPE_LABEL: Record<string, string> = {
  GOVERNMENT: "行政",
  PRIVATE: "民間",
};

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  // 未読件数はサイドバーのバッジに使う。ダッシュボード全体で共有する値なので
  // レイアウトで一度だけ数える。
  const unreadCount = await countUnread(user.id);

  return (
    <div className="flex min-h-screen">
      <DashboardSidebar unreadCount={unreadCount} />
      <div className="flex flex-1 flex-col">
        <header className="flex h-16 items-center justify-between border-b border-slate-200 bg-white px-6">
          <div className="flex items-center text-sm text-slate-500">
            {user.organization.name}
            <span className="ml-2 rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
              {ORG_TYPE_LABEL[user.organization.type] ?? user.organization.type}
            </span>
            {/* 管理画面から、一般の閲覧者が見る組織ページへ */}
            <Link
              href={`/organizations/${user.organization.id}`}
              className="ml-3 rounded-md px-2 py-1 text-xs font-medium text-sky-700 hover:bg-sky-50"
            >
              公開ページ ↗
            </Link>
          </div>
          <div className="text-sm text-slate-700">
            {user.name}
            <span className="ml-2 rounded-full bg-sky-100 px-2 py-0.5 text-xs text-sky-700">
              {user.role}
            </span>
          </div>
        </header>
        <main className="flex-1 p-6">{children}</main>
      </div>
    </div>
  );
}
