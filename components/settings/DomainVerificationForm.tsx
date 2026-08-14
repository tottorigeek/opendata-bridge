"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const inputClass =
  "w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-100";

interface Claim {
  domain: string;
  recordName: string;
  recordValue: string;
}

/**
 * 組織のドメイン確認。
 *
 * 1. 確認したいドメインを登録すると、設定すべき TXT レコードが表示される
 * 2. DNS に反映されたら「確認する」を押して所有を検証する
 *
 * 行政組織は .lg.jp / .go.jp のときだけ確認済みバッジが自動付与される。
 * 独自ドメインは所有を証明できても「行政である」証明にはならないため。
 */
export default function DomainVerificationForm({
  claimedDomain,
  verifiedDomain,
  pendingRecord,
}: {
  claimedDomain: string | null;
  verifiedDomain: string | null;
  /** 登録済みで未確認のときに表示する TXT レコード。 */
  pendingRecord: { recordName: string; recordValue: string } | null;
}) {
  const router = useRouter();
  const [domain, setDomain] = useState(claimedDomain ?? "");
  const [claim, setClaim] = useState<Claim | null>(
    claimedDomain && pendingRecord
      ? { domain: claimedDomain, ...pendingRecord }
      : null,
  );
  const [message, setMessage] = useState<{ tone: "ok" | "ng"; text: string } | null>(
    null,
  );
  const [loading, setLoading] = useState(false);

  async function submitClaim(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setMessage(null);
    try {
      const res = await fetch("/api/organization/domain", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ domain }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMessage({ tone: "ng", text: data.error ?? "登録に失敗しました。" });
        return;
      }
      setClaim(data);
      router.refresh();
    } catch {
      setMessage({ tone: "ng", text: "通信エラーが発生しました。" });
    } finally {
      setLoading(false);
    }
  }

  async function runVerify() {
    setLoading(true);
    setMessage(null);
    try {
      const res = await fetch("/api/organization/domain", { method: "PUT" });
      const data = await res.json().catch(() => ({}));
      setMessage({
        tone: res.ok && data.verified ? "ok" : "ng",
        text: data.message ?? data.error ?? "確認に失敗しました。",
      });
      if (res.ok && data.verified) router.refresh();
    } catch {
      setMessage({ tone: "ng", text: "通信エラーが発生しました。" });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-4">
      {verifiedDomain && (
        <p className="rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          ドメイン <strong>{verifiedDomain}</strong> の所有を確認済みです。
        </p>
      )}

      <form onSubmit={submitClaim} className="max-w-xl space-y-3">
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">
            確認したいドメイン
          </label>
          <input
            value={domain}
            onChange={(e) => setDomain(e.target.value)}
            placeholder="例: pref.tottori.lg.jp"
            className={inputClass}
          />
          <p className="mt-1 text-xs text-slate-500">
            行政組織の確認済みバッジは <code>.lg.jp</code> / <code>.go.jp</code>{" "}
            のドメインでのみ自動付与されます。
          </p>
        </div>
        <button
          type="submit"
          disabled={loading || !domain.trim()}
          className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
        >
          このドメインで確認を開始
        </button>
      </form>

      {claim && (
        <div className="max-w-xl rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm">
          <p className="text-slate-700">
            次の TXT レコードを DNS に追加してから「確認する」を押してください。
          </p>
          <dl className="mt-3 space-y-2 text-xs">
            <div>
              <dt className="text-slate-500">レコード名</dt>
              <dd className="mt-0.5 break-all font-mono text-slate-800">
                {claim.recordName}
              </dd>
            </div>
            <div>
              <dt className="text-slate-500">値</dt>
              <dd className="mt-0.5 break-all font-mono text-slate-800">
                {claim.recordValue}
              </dd>
            </div>
          </dl>
          <button
            type="button"
            onClick={runVerify}
            disabled={loading}
            className="mt-3 rounded-md bg-sky-600 px-4 py-2 text-xs font-semibold text-white hover:bg-sky-700 disabled:opacity-60"
          >
            {loading ? "確認中..." : "確認する"}
          </button>
        </div>
      )}

      {message && (
        <p
          className={`max-w-xl rounded-md border px-4 py-3 text-sm ${
            message.tone === "ok"
              ? "border-emerald-200 bg-emerald-50 text-emerald-800"
              : "border-amber-200 bg-amber-50 text-amber-800"
          }`}
        >
          {message.text}
        </p>
      )}
    </div>
  );
}
