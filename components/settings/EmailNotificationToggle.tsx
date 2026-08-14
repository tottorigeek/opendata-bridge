"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/**
 * メール通知の受け取り設定。
 * オフにしてもアプリ内通知は届くため、通知を見落とすことはない。
 */
export default function EmailNotificationToggle({
  enabled,
  mailConfigured,
}: {
  enabled: boolean;
  /** サーバーにメール送信基盤が設定されているか。 */
  mailConfigured: boolean;
}) {
  const router = useRouter();
  const [value, setValue] = useState(enabled);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function toggle(next: boolean) {
    setValue(next);
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/me/notifications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ emailNotifications: next }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? "保存に失敗しました。");
        setValue(!next);
        return;
      }
      router.refresh();
    } catch {
      setError("通信エラーが発生しました。");
      setValue(!next);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-2xl">
      <label className="flex items-start gap-3 text-sm text-slate-700">
        <input
          type="checkbox"
          checked={value}
          disabled={loading}
          onChange={(e) => toggle(e.target.checked)}
          className="mt-0.5"
        />
        <span>
          通知をメールでも受け取る
          <span className="mt-0.5 block text-xs text-slate-500">
            オフにしてもアプリ内の通知は届きます。
            {!mailConfigured &&
              " ※ このサーバーはメール送信が未設定のため、現在メールは送信されません。"}
          </span>
        </span>
      </label>
      {error && <p className="mt-2 text-xs text-red-700">{error}</p>}
    </div>
  );
}
