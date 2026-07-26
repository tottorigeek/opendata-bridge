import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";

/** 公開ページ用の共通ヘッダー。ログイン状態に応じてナビを切り替える。 */
export default async function SiteHeader() {
  const user = await getCurrentUser();

  return (
    <header className="border-b border-slate-200 bg-white">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4">
        <Link href="/" className="flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-sky-600 text-sm font-bold text-white">
            OB
          </span>
          <span className="text-lg font-semibold tracking-tight text-slate-900">
            OpenData Bridge
          </span>
        </Link>

        <nav className="flex items-center gap-1 text-sm font-medium text-slate-600">
          <Link
            href="/catalog"
            className="rounded-md px-3 py-2 hover:bg-slate-100 hover:text-slate-900"
          >
            カタログ
          </Link>
          <Link
            href="/dashboard"
            className="rounded-md px-3 py-2 hover:bg-slate-100 hover:text-slate-900"
          >
            ダッシュボード
          </Link>
          {user ? (
            <Link
              href="/dashboard"
              className="ml-2 rounded-md bg-sky-600 px-4 py-2 text-white hover:bg-sky-700"
            >
              {user.name} さん
            </Link>
          ) : (
            <Link
              href="/login"
              className="ml-2 rounded-md bg-sky-600 px-4 py-2 text-white hover:bg-sky-700"
            >
              ログイン
            </Link>
          )}
        </nav>
      </div>
    </header>
  );
}
