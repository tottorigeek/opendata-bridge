"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const STATUS_OPTIONS = [
  { value: "OPEN", label: "受付済み" },
  { value: "IN_PROGRESS", label: "対応中" },
  { value: "RESOLVED", label: "対応済み" },
  { value: "DECLINED", label: "対応しない" },
];

/**
 * リクエストへの返信と状態変更。
 *
 * 返信は送信者・受け取った組織の双方が書ける。
 * 状態を変えられるのは受け取った組織だけ(サーバー側でも検証している)。
 */
export default function RequestThread({
  requestId,
  currentStatus,
  canChangeStatus,
}: {
  requestId: string;
  currentStatus: string;
  canChangeStatus: boolean;
}) {
  const router = useRouter();
  const [reply, setReply] = useState("");
  const [status, setStatus] = useState(currentStatus);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(nextStatus?: string) {
    setError(null);
    setLoading(true);
    try {
      const res = await fetch(`/api/requests/${requestId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reply: reply.trim() || undefined,
          status: nextStatus,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "送信に失敗しました。");
        return;
      }
      setReply("");
      if (nextStatus) setStatus(nextStatus);
      router.refresh();
    } catch {
      setError("通信エラーが発生しました。");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-3">
      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <textarea
        value={reply}
        onChange={(e) => setReply(e.target.value)}
        rows={4}
        maxLength={5000}
        placeholder="返信を書く"
        className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
      />

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => submit()}
          disabled={loading || !reply.trim()}
          className="rounded-md bg-sky-600 px-5 py-2 text-sm font-semibold text-white hover:bg-sky-700 disabled:opacity-60"
        >
          {loading ? "送信中..." : "返信する"}
        </button>

        {canChangeStatus && (
          <div className="flex items-center gap-2">
            <label className="text-xs text-slate-500">状態</label>
            <select
              value={status}
              onChange={(e) => submit(e.target.value)}
              disabled={loading}
              className="rounded-md border border-slate-300 px-3 py-2 text-sm"
            >
              {STATUS_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
            <span className="text-xs text-slate-500">
              返信を書いた状態で変更すると、返信も同時に投稿されます。
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
