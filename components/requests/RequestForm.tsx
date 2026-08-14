"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const inputClass =
  "w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-100";

export interface RequestTargetDataset {
  id: string;
  title: string;
}

/**
 * 組織へのデータリクエスト送信フォーム。
 *
 * 送れるかどうかの判定はサーバー側(lib/requests.ts の canSendRequest)が正で、
 * ここでは送れない理由を表示するだけにする。
 */
export default function RequestForm({
  organizationId,
  organizationName,
  datasets,
  disabledReason,
}: {
  organizationId: string;
  organizationName: string;
  /** 修正依頼の対象に選べる、その組織の公開データセット。 */
  datasets: RequestTargetDataset[];
  /** 送れない場合の理由。null なら送れる。 */
  disabledReason: string | null;
}) {
  const router = useRouter();
  const [kind, setKind] = useState<"CREATE" | "FIX">("FIX");
  const [datasetId, setDatasetId] = useState("");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  if (disabledReason) {
    return (
      <p className="rounded-md border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
        {disabledReason}
      </p>
    );
  }

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          organizationId,
          kind,
          datasetId: kind === "FIX" && datasetId ? datasetId : null,
          title,
          body,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "送信に失敗しました。");
        return;
      }
      router.push(`/dashboard/requests/${data.id}`);
      router.refresh();
    } catch {
      setError("通信エラーが発生しました。");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={submit} className="max-w-2xl space-y-4">
      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div>
        <label className="mb-1 block text-sm font-medium text-slate-700">種別</label>
        <div className="grid gap-2 sm:grid-cols-2">
          {(
            [
              { value: "FIX", label: "修正依頼", hint: "公開中のデータの誤りを指摘する" },
              { value: "CREATE", label: "公開依頼", hint: "新しいデータの公開をお願いする" },
            ] as const
          ).map((k) => (
            <label
              key={k.value}
              className={`cursor-pointer rounded-md border px-3 py-2 text-sm ${
                kind === k.value
                  ? "border-sky-400 bg-sky-50 text-sky-800"
                  : "border-slate-300 text-slate-700"
              }`}
            >
              <input
                type="radio"
                name="kind"
                className="mr-2"
                checked={kind === k.value}
                onChange={() => setKind(k.value)}
              />
              {k.label}
              <span className="mt-0.5 block text-xs text-slate-500">{k.hint}</span>
            </label>
          ))}
        </div>
      </div>

      {kind === "FIX" && (
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">
            対象データセット
          </label>
          <select
            value={datasetId}
            onChange={(e) => setDatasetId(e.target.value)}
            className={inputClass}
          >
            <option value="">指定しない</option>
            {datasets.map((d) => (
              <option key={d.id} value={d.id}>
                {d.title}
              </option>
            ))}
          </select>
        </div>
      )}

      <div>
        <label className="mb-1 block text-sm font-medium text-slate-700">件名</label>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          required
          maxLength={200}
          placeholder="例: 避難所一覧の住所に誤りがあります"
          className={inputClass}
        />
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium text-slate-700">内容</label>
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          required
          rows={6}
          maxLength={5000}
          placeholder="該当する行や項目、正しいと思われる値、根拠となる情報などを具体的にお書きください。"
          className={inputClass}
        />
      </div>

      <button
        type="submit"
        disabled={loading || !title.trim() || !body.trim()}
        className="rounded-md bg-sky-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-sky-700 disabled:opacity-60"
      >
        {loading ? "送信中..." : `${organizationName} へ送信`}
      </button>
    </form>
  );
}
