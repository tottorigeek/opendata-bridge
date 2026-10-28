"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/** API を呼び、失敗したらメッセージを返す。 */
async function call(url: string, method: string): Promise<string | null> {
  try {
    const res = await fetch(url, { method });
    if (res.ok) return null;
    const data = await res.json().catch(() => ({}));
    return data.error ?? "処理に失敗しました。";
  } catch {
    return "通信エラーが発生しました。";
  }
}

/** ページ上部に置く「ゴミ箱に入れる」ボタン。 */
export function MoveToTrashButton({ id, title }: { id: string; title: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function handle() {
    if (
      !confirm(
        `「${title}」をゴミ箱に入れます。\n\n公開中の場合はカタログと API から見えなくなります。ゴミ箱から元に戻せます。`,
      )
    )
      return;
    setBusy(true);
    const error = await call(`/api/datasets/${id}`, "DELETE");
    if (error) {
      alert(error);
      setBusy(false);
      return;
    }
    router.push("/dashboard/trash");
    router.refresh();
  }

  return (
    <button
      type="button"
      onClick={handle}
      disabled={busy}
      className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-60"
    >
      {busy ? "移動中..." : "ゴミ箱に入れる"}
    </button>
  );
}

/**
 * ゴミ箱のデータセットに対する操作(元に戻す / 完全に削除)。
 * 完全な削除は組織の管理者だけ。
 */
export function TrashedDatasetActions({
  id,
  title,
  isAdmin,
  afterPurge = "/dashboard/trash",
}: {
  id: string;
  title: string;
  isAdmin: boolean;
  /** 完全に削除したあとに移る先(詳細画面から消したときはゴミ箱へ)。 */
  afterPurge?: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<"restore" | "purge" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function restore() {
    setBusy("restore");
    setError(null);
    const e = await call(`/api/datasets/${id}/restore`, "POST");
    if (e) {
      setError(e);
      setBusy(null);
      return;
    }
    router.refresh();
    setBusy(null);
  }

  async function purge() {
    if (
      !confirm(
        `「${title}」を完全に削除します。\n\n保存しているファイル(過去の版を含む)もすべて消え、元に戻せません。よろしいですか?`,
      )
    )
      return;
    setBusy("purge");
    setError(null);
    const e = await call(`/api/datasets/${id}/purge`, "DELETE");
    if (e) {
      setError(e);
      setBusy(null);
      return;
    }
    router.push(afterPurge);
    router.refresh();
  }

  return (
    <div className="flex shrink-0 flex-col items-start gap-1 sm:items-end">
      <div className="flex gap-2 whitespace-nowrap">
        <button
          type="button"
          onClick={restore}
          disabled={busy !== null}
          className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
        >
          {busy === "restore" ? "戻しています..." : "元に戻す"}
        </button>
        {isAdmin && (
          <button
            type="button"
            onClick={purge}
            disabled={busy !== null}
            className="rounded-md bg-red-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-60"
          >
            {busy === "purge" ? "削除しています..." : "完全に削除"}
          </button>
        )}
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}
