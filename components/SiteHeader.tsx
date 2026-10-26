import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { toAccountSummary } from "@/lib/account";
import AccountMenu from "@/components/AccountMenu";

/** 公開ページ用の共通ヘッダー。ログイン状態に応じてナビを切り替える。 */
export default async function SiteHeader() {
  const user = await getCurrentUser();

  return (
    <header className="border-b border-slate-200 bg-white">
      {/* リンクが増えると狭い画面で横に収まらないため、折り返せるようにしておく。 */}
      <div className="mx-auto flex min-h-16 max-w-6xl flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-2">
        <Link href="/" className="flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-sky-600 text-sm font-bold text-white">
            OB
          </span>
          <span className="text-lg font-semibold tracking-tight text-slate-900">
            OpenData Bridge
          </span>
        </Link>

        <nav className="flex flex-wrap items-center gap-1 text-sm font-medium text-slate-600">
          <Link
            href="/about"
            className="rounded-md px-2 py-2 hover:bg-slate-100 hover:text-slate-900 sm:px-3"
          >
            サービス紹介
          </Link>
          <Link
            href="/catalog"
            className="rounded-md px-2 py-2 hover:bg-slate-100 hover:text-slate-900 sm:px-3"
          >
            カタログ
          </Link>
          <Link
            href="/organizations"
            className="rounded-md px-2 py-2 hover:bg-slate-100 hover:text-slate-900 sm:px-3"
          >
            組織
          </Link>
          {/* 未ログインでダッシュボードを開くとログイン画面に飛ぶだけなので、
              「ログイン」と重複するリンクは出さない(狭い画面でメニューが 2 段になる原因でもある)。 */}
          {user && (
            <Link
              href="/dashboard"
              className="rounded-md px-2 py-2 hover:bg-slate-100 hover:text-slate-900 sm:px-3"
            >
              ダッシュボード
            </Link>
          )}
          {user ? (
            // ログイン後は「ログイン」の代わりに、アカウント情報とメニューを開くボタンを出す
            <AccountMenu account={toAccountSummary(user)} />
          ) : (
            <Link
              href="/login"
              className="ml-1 rounded-md bg-sky-600 px-3 py-2 text-white hover:bg-sky-700 sm:ml-2 sm:px-4"
            >
              ログイン
            </Link>
          )}
        </nav>
      </div>
    </header>
  );
}
