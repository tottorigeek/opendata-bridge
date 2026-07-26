"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/**
 * データセット詳細ページのアクション群(クライアント)。
 * - 公開申請(DRAFT / REJECTED)
 * - 承認 / 差し戻し(ADMIN かつ PENDING_REVIEW)
 * - 削除
 */
export default function DatasetDetailActions({
  id,
  status,
  isAdmin,
}: {
  id: string;
  status: string;
  isAdmin: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function call(url: string, method: string, body?: unknown) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(url, {
        method,
        headers: body ? { "Content-Type": "application/json" } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "処理に失敗しました。");
        setBusy(false);
        return false;
      }
      return true;
    } catch {
      setError("通信エラーが発生しました。");
      setBusy(false);
      return false;
    }
  }

  async function handleSubmitForReview() {
    if (!(await call(`/api/datasets/${id}/submit`, "POST"))) return;
    router.refresh();
    setBusy(false);
  }

  async function handleReview(decision: "approve" | "reject") {
    const label = decision === "approve" ? "承認" : "差し戻し";
    if (!confirm(`このデータセットを${label}します。よろしいですか?`)) return;
    if (!(await call(`/api/datasets/${id}/review`, "POST", { decision }))) return;
    router.refresh();
    setBusy(false);
  }

  async function handleDelete() {
    if (
      !confirm(
        "このデータセットを削除します。この操作は取り消せません。よろしいですか?",
      )
    )
      return;
    if (!(await call(`/api/datasets/${id}`, "DELETE"))) return;
    router.push("/dashboard/datasets");
    router.refresh();
  }

  const canSubmit = status === "DRAFT" || status === "REJECTED";
  const canReview = isAdmin && status === "PENDING_REVIEW";

  return (
    <div className="space-y-3">
      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        {canSubmit && (
          <button
            onClick={handleSubmitForReview}
            disabled={busy}
            className="rounded-md bg-sky-600 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-700 disabled:opacity-60"
          >
            公開申請する
          </button>
        )}
        {canReview && (
          <>
            <button
              onClick={() => handleReview("approve")}
              disabled={busy}
              className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
            >
              承認して公開
            </button>
            <button
              onClick={() => handleReview("reject")}
              disabled={busy}
              className="rounded-md border border-amber-400 bg-white px-4 py-2 text-sm font-semibold text-amber-700 hover:bg-amber-50 disabled:opacity-60"
            >
              差し戻す
            </button>
          </>
        )}
        <button
          onClick={handleDelete}
          disabled={busy}
          className="rounded-md border border-red-300 bg-white px-4 py-2 text-sm font-semibold text-red-600 hover:bg-red-50 disabled:opacity-60"
        >
          削除
        </button>
      </div>
      {status === "PENDING_REVIEW" && !isAdmin && (
        <p className="text-xs text-slate-500">
          承認待ちです。組織の ADMIN による承認をお待ちください。
        </p>
      )}
    </div>
  );
}
