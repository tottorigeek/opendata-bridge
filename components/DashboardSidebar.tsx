"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import LogoutButton from "@/components/LogoutButton";

const NAV = [
  { href: "/dashboard/datasets", label: "データセット" },
  { href: "/dashboard/merge", label: "マージ" },
  { href: "/dashboard/requests", label: "データリクエスト" },
  { href: "/dashboard/notifications", label: "通知" },
  { href: "/dashboard/api-keys", label: "APIキー" },
  { href: "/dashboard/settings", label: "組織設定" },
];

/** 未読件数はサーバー側で数え、レイアウトから渡す。 */
export default function DashboardSidebar({ unreadCount = 0 }: { unreadCount?: number }) {
  const pathname = usePathname();

  return (
    <aside className="flex w-60 shrink-0 flex-col border-r border-slate-200 bg-white">
      <div className="flex h-16 items-center border-b border-slate-200 px-5">
        <Link href="/" className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-md bg-sky-600 text-xs font-bold text-white">
            OB
          </span>
          <span className="text-sm font-semibold text-slate-900">OpenData Bridge</span>
        </Link>
      </div>

      <nav className="flex-1 space-y-1 p-3">
        <Link
          href="/dashboard"
          className={`block rounded-md px-3 py-2 text-sm font-medium ${
            pathname === "/dashboard"
              ? "bg-sky-50 text-sky-700"
              : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
          }`}
        >
          概要
        </Link>
        {NAV.map((item) => {
          const active = pathname === item.href || pathname.startsWith(item.href + "/");
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`block rounded-md px-3 py-2 text-sm font-medium ${
                active
                  ? "bg-sky-50 text-sky-700"
                  : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
              }`}
            >
              {item.label}
              {item.href === "/dashboard/notifications" && unreadCount > 0 && (
                <span className="ml-2 rounded-full bg-sky-600 px-1.5 py-0.5 text-xs font-semibold text-white">
                  {unreadCount}
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-slate-200 p-3">
        <LogoutButton />
      </div>
    </aside>
  );
}
