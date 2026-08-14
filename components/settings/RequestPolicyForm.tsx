"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const OPTIONS = [
  {
    value: "VERIFIED_USERS",
    label: "メール確認済みの利用者から受け付ける",
    hint: "住民やシビックテックからの指摘も拾えます。",
  },
  {
    value: "VERIFIED_ORGS",
    label: "確認済み組織に所属する人からのみ受け付ける",
    hint: "質は担保されますが、個人からの指摘は届かなくなります。",
  },
  {
    value: "CLOSED",
    label: "受け付けない",
    hint: "リクエストの受付を停止します。",
  },
];

/** データリクエストの受付範囲を設定するフォーム。ADMIN のみ表示される。 */
export default function RequestPolicyForm({ policy }: { policy: string }) {
  const router = useRouter();
  const [value, setValue] = useState(policy);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function save(next: string) {
    setValue(next);
    setSaved(false);
    setError(null);
    setLoading(true);
    try {
      const form = new FormData();
      form.set("requestPolicy", next);
      const res = await fetch("/api/organization", { method: "PATCH", body: form });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "保存に失敗しました。");
        return;
      }
      setSaved(true);
      router.refresh();
    } catch {
      setError("通信エラーが発生しました。");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-2xl space-y-3">
      {error && (
        <p className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </p>
      )}
      {saved && (
        <p className="rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          受付範囲を保存しました。
        </p>
      )}

      <div className="space-y-2">
        {OPTIONS.map((o) => (
          <label
            key={o.value}
            className={`block cursor-pointer rounded-md border px-4 py-3 text-sm ${
              value === o.value
                ? "border-sky-400 bg-sky-50 text-sky-900"
                : "border-slate-300 text-slate-700"
            }`}
          >
            <input
              type="radio"
              name="requestPolicy"
              className="mr-2"
              checked={value === o.value}
              disabled={loading}
              onChange={() => save(o.value)}
            />
            {o.label}
            <span className="mt-0.5 block text-xs text-slate-500">{o.hint}</span>
          </label>
        ))}
      </div>
    </div>
  );
}
