export default function LogoutButton() {
  // ログアウトはサーバーで cookie を破棄する必要があるため、POST フォームで送信する。
  return (
    <form action="/api/auth/logout" method="post">
      <button
        type="submit"
        className="w-full rounded-md px-3 py-2 text-left text-sm text-slate-600 hover:bg-slate-100 hover:text-slate-900"
      >
        ログアウト
      </button>
    </form>
  );
}
