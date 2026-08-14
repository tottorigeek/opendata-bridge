"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export interface StaleInputView {
  side: string;
  title: string;
  usedVersion: number | null;
  currentVersion: number | null;
}

/**
 * 出典の更新検知と作り直し。
 *
 * ピン留め(既定)では出典が更新されても何も起きず、ここで知らせるだけにする。
 * latest を選ぶと自動で作り直すが、品質ゲートを通らなければ適用せず据え置く。
 */
export default function RefreshPanel({
  datasetId,
  stale,
  followLatest,
  inputs,
  lastMessage,
}: {
  datasetId: string;
  stale: boolean;
  followLatest: boolean;
  inputs: StaleInputView[];
  lastMessage: string;
}) {
  const router = useRouter();
  const [follow, setFollow] = useState(followLatest);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);
  const [loading, setLoading] = useState(false);

  async function toggle(next: boolean) {
    setFollow(next);
    setLoading(true);
    try {
      await fetch("/api/merge/refresh", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ datasetId, followLatest: next }),
      });
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  async function refresh() {
    setLoading(true);
    setResult(null);
    try {
      const res = await fetch("/api/merge/refresh", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ datasetId }),
      });
      const data = await res.json().catch(() => ({}));
      setResult({
        ok: Boolean(data.applied),
        text: data.message ?? data.error ?? "作り直しに失敗しました。",
      });
      router.refresh();
    } catch {
      setResult({ ok: false, text: "通信エラーが発生しました。" });
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-6">
      <h2 className="text-lg font-semibold text-slate-900">出典の更新</h2>

      {stale ? (
        <div className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          出典に新しい版があります。作り直すと最新の内容で再計算されます。
          <ul className="mt-2 space-y-0.5 text-xs">
            {inputs.map((i) => (
              <li key={i.side}>
                {i.side}: {i.title} — 使用中 第 {i.usedVersion ?? "?"} 版 / 最新 第{" "}
                {i.currentVersion ?? "?"} 版
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <p className="mt-3 text-sm text-slate-600">
          出典は更新されていません(マージ時点の版のままです)。
        </p>
      )}

      <label className="mt-4 flex items-start gap-3 text-sm text-slate-700">
        <input
          type="checkbox"
          checked={follow}
          disabled={loading}
          onChange={(e) => toggle(e.target.checked)}
          className="mt-0.5"
        />
        <span>
          出典が更新されたら自動で作り直す
          <span className="mt-0.5 block text-xs text-slate-500">
            既定はピン留め(自動更新しない)です。自動更新にしても、キー列が消えた場合や
            カバー率が大きく落ちた場合は適用せず、通知だけを行います。
          </span>
        </span>
      </label>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={refresh}
          disabled={loading}
          className="rounded-md bg-sky-600 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-700 disabled:opacity-60"
        >
          {loading ? "実行中..." : "今すぐ作り直す"}
        </button>
        {result && (
          <span className={`text-xs ${result.ok ? "text-emerald-700" : "text-amber-700"}`}>
            {result.text}
          </span>
        )}
      </div>

      {!result && lastMessage && (
        <p className="mt-3 text-xs text-slate-500">前回の結果: {lastMessage}</p>
      )}
    </section>
  );
}
