"use client";

import { useState } from "react";

/**
 * メール未確認のときに出す再送バナー。
 *
 * 送信基盤が未設定の環境では実際には送られないため、その旨を明示する
 * (開発中に「届かない」と誤解されないようにする)。
 */
export default function EmailVerificationNotice({ email }: { email: string }) {
  const [state, setState] = useState<
    { kind: "idle" } | { kind: "sent"; delivered: boolean } | { kind: "error"; message: string }
  >({ kind: "idle" });
  const [loading, setLoading] = useState(false);

  async function resend() {
    setLoading(true);
    try {
      const res = await fetch("/api/auth/verify-email", { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setState({ kind: "error", message: data.error ?? "再送に失敗しました。" });
        return;
      }
      setState({ kind: "sent", delivered: Boolean(data.delivered) });
    } catch {
      setState({ kind: "error", message: "通信エラーが発生しました。" });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
      <h2 className="text-sm font-semibold text-amber-900">
        メールアドレスが未確認です
      </h2>
      <p className="mt-1 text-sm text-amber-800">
        {email} 宛の確認リンクを開いてください。確認が済むと、他組織へのデータ修正
        リクエストなど、なりすましが問題になる機能を利用できます。
      </p>

      {state.kind === "sent" && (
        <p className="mt-2 text-xs text-amber-900">
          {state.delivered
            ? "確認メールを再送しました。"
            : "確認リンクを発行しました。※このサーバーはメール送信が未設定のため、リンクはサーバーログに出力されています。"}
        </p>
      )}
      {state.kind === "error" && (
        <p className="mt-2 text-xs text-red-700">{state.message}</p>
      )}

      <button
        type="button"
        onClick={resend}
        disabled={loading}
        className="mt-3 rounded-md bg-amber-700 px-4 py-2 text-xs font-semibold text-white hover:bg-amber-800 disabled:opacity-60"
      >
        {loading ? "送信中..." : "確認メールを再送"}
      </button>
    </div>
  );
}
