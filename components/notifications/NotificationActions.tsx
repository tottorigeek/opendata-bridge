"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/** 通知一覧の操作(未読を既読にする / 既読を削除する)。 */
export default function NotificationActions({
  unreadCount,
  readCount,
}: {
  unreadCount: number;
  readCount: number;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function call(method: "PATCH" | "DELETE") {
    setLoading(true);
    try {
      await fetch("/api/notifications", {
        method,
        headers: { "Content-Type": "application/json" },
        body: method === "PATCH" ? JSON.stringify({}) : undefined,
      });
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex gap-2">
      <button
        type="button"
        onClick={() => call("PATCH")}
        disabled={loading || unreadCount === 0}
        className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
      >
        すべて既読にする
      </button>
      <button
        type="button"
        onClick={() => call("DELETE")}
        disabled={loading || readCount === 0}
        className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-500 hover:bg-slate-50 disabled:opacity-50"
      >
        既読を削除
      </button>
    </div>
  );
}
