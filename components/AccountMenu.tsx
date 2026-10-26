"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";

export type AccountSummary = {
  name: string;
  email: string;
  emailVerified: boolean;
  role: string;
  organizationId: string;
  organizationName: string;
  organizationTypeLabel: string;
};

const ROLE_LABEL: Record<string, string> = {
  ADMIN: "管理者",
  MEMBER: "メンバー",
};

/**
 * ログイン後にヘッダーに出すアカウントメニュー。
 *
 * <details> で開閉するので JavaScript が動かなくても使える。動く環境では、
 * メニューの外を押したときと Esc で閉じる。
 */
export default function AccountMenu({ account }: { account: AccountSummary }) {
  const ref = useRef<HTMLDetailsElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  /**
   * 開いたときにメニューが画面からはみ出さないよう横位置を補正する。
   * 狭い画面ではヘッダーが折り返してボタンが左寄りになり、右揃えのメニューが左外へ出るため。
   */
  const keepInViewport = () => {
    const panel = panelRef.current;
    if (!panel || !ref.current?.open) return;
    panel.style.transform = "";
    const margin = 8;
    const rect = panel.getBoundingClientRect();
    let shift = 0;
    if (rect.left < margin) shift = margin - rect.left;
    else if (rect.right > window.innerWidth - margin) shift = window.innerWidth - margin - rect.right;
    if (shift !== 0) panel.style.transform = `translateX(${shift}px)`;
  };

  useEffect(() => {
    const close = (e: Event) => {
      const el = ref.current;
      if (!el?.open) return;
      if (e instanceof KeyboardEvent ? e.key === "Escape" : !el.contains(e.target as Node)) {
        el.open = false;
      }
    };
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", close);
    };
  }, []);

  const initial = [...account.name.trim()][0] ?? "?";

  return (
    <details ref={ref} className="relative ml-1 sm:ml-2" onToggle={keepInViewport}>
      <summary
        className="flex cursor-pointer list-none items-center gap-2 rounded-md border border-slate-200 bg-white px-2 py-1.5 text-sm text-slate-700 hover:bg-slate-50 [&::-webkit-details-marker]:hidden"
        aria-label="アカウントメニュー"
      >
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-sky-600 text-xs font-bold text-white">
          {initial}
        </span>
        <span className="hidden max-w-[10rem] truncate sm:inline">{account.name}</span>
        <span aria-hidden="true" className="text-xs text-slate-400">
          ▾
        </span>
      </summary>

      <div
        ref={panelRef}
        className="absolute right-0 z-[1100] mt-2 w-72 max-w-[calc(100vw-1rem)] rounded-lg border border-slate-200 bg-white p-2 text-sm shadow-lg"
      >
        <div className="border-b border-slate-100 px-3 pb-3 pt-2">
          <p className="font-semibold text-slate-900">{account.name}</p>
          <p className="mt-0.5 break-all text-xs text-slate-500">{account.email}</p>
          <p className="mt-1 text-xs">
            {account.emailVerified ? (
              <span className="text-emerald-700">メールアドレス確認済み</span>
            ) : (
              <Link href="/dashboard/settings" className="text-amber-700 hover:underline">
                メールアドレスが未確認です
              </Link>
            )}
          </p>
          <p className="mt-2 text-xs text-slate-600">
            {account.organizationName}
            <span className="ml-1.5 rounded-full bg-slate-100 px-2 py-0.5 text-slate-600">
              {account.organizationTypeLabel}
            </span>
            <span className="ml-1 rounded-full bg-sky-50 px-2 py-0.5 text-sky-700">
              {ROLE_LABEL[account.role] ?? account.role}
            </span>
          </p>
        </div>
        <nav className="flex flex-col py-1">
          <MenuLink href="/dashboard">ダッシュボード</MenuLink>
          <MenuLink href={`/organizations/${account.organizationId}`}>組織の公開ページ</MenuLink>
          <MenuLink href="/dashboard/settings">設定</MenuLink>
        </nav>
        {/* ログアウトはサーバーで cookie を破棄する必要があるため、POST フォームで送る */}
        <form action="/api/auth/logout" method="post" className="border-t border-slate-100 pt-1">
          <button
            type="submit"
            className="w-full rounded-md px-3 py-2 text-left text-slate-600 hover:bg-slate-100 hover:text-slate-900"
          >
            ログアウト
          </button>
        </form>
      </div>
    </details>
  );
}

function MenuLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className="rounded-md px-3 py-2 text-slate-700 hover:bg-slate-100">
      {children}
    </Link>
  );
}
