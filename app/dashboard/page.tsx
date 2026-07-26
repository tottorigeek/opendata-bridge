import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";

const CARDS = [
  {
    href: "/dashboard/datasets",
    title: "データセット",
    body: "組織のデータセットを登録・管理します。",
  },
  {
    href: "/dashboard/merge",
    title: "マージ",
    body: "他組織のデータと名寄せ・統合します。",
  },
  {
    href: "/dashboard/api-keys",
    title: "APIキー",
    body: "データ利活用のための API キーを発行します。",
  },
  {
    href: "/dashboard/settings",
    title: "組織設定",
    body: "組織情報やメンバーを管理します。",
  },
];

export default async function DashboardHome() {
  const user = await getCurrentUser();

  return (
    <div>
      <h1 className="text-2xl font-bold text-slate-900">
        ようこそ、{user?.name} さん
      </h1>
      <p className="mt-1 text-slate-600">
        {user?.organization.name} のダッシュボードです。ここから各機能にアクセスできます。
      </p>

      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {CARDS.map((c) => (
          <Link
            key={c.href}
            href={c.href}
            className="rounded-xl border border-slate-200 bg-white p-5 transition hover:border-sky-300 hover:shadow-sm"
          >
            <h2 className="font-semibold text-slate-900">{c.title}</h2>
            <p className="mt-1 text-sm text-slate-600">{c.body}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
