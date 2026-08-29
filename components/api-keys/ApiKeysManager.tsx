"use client";

import { useState } from "react";

export type ApiKeyRow = {
  id: string;
  label: string;
  maskedKey: string;
  callCount: number;
  revoked: boolean;
  createdAt: string;
  revokedAt: string | null;
};

export type UsageSummary = {
  totalCalls: number;
  activeKeys: number;
  totalKeys: number;
};

type KeysResponse = { keys: ApiKeyRow[]; usage: UsageSummary };

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString("ja-JP", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function ApiKeysManager({
  initialKeys,
  initialUsage,
  origin,
}: {
  initialKeys: ApiKeyRow[];
  initialUsage: UsageSummary;
  origin: string;
}) {
  const [keys, setKeys] = useState<ApiKeyRow[]>(initialKeys);
  const [usage, setUsage] = useState<UsageSummary>(initialUsage);
  const [label, setLabel] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [issuedKey, setIssuedKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function refresh() {
    const res = await fetch("/api/keys", { cache: "no-store" });
    if (!res.ok) return;
    const data: KeysResponse = await res.json();
    setKeys(data.keys);
    setUsage(data.usage);
  }

  async function handleIssue(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setIssuedKey(null);
    setCopied(false);
    const trimmed = label.trim();
    if (!trimmed) {
      setError("ラベルを入力してください。");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label: trimmed }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "APIキーの発行に失敗しました。");
        return;
      }
      setIssuedKey(data.key);
      setLabel("");
      await refresh();
    } catch {
      setError("通信エラーが発生しました。");
    } finally {
      setLoading(false);
    }
  }

  async function handleRevoke(id: string) {
    if (!confirm("このAPIキーを失効します。よろしいですか?(元に戻せません)")) {
      return;
    }
    setError(null);
    try {
      const res = await fetch(`/api/keys/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? "失効に失敗しました。");
        return;
      }
      await refresh();
    } catch {
      setError("通信エラーが発生しました。");
    }
  }

  async function copyIssued() {
    if (!issuedKey) return;
    try {
      await navigator.clipboard.writeText(issuedKey);
      setCopied(true);
    } catch {
      // クリップボード不可環境は無視
    }
  }

  return (
    <div className="space-y-8">
      {/* 利用量サマリー */}
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <div className="text-sm text-slate-500">合計呼び出し回数</div>
          <div className="mt-1 text-2xl font-bold text-slate-900">
            {usage.totalCalls.toLocaleString()}
          </div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <div className="text-sm text-slate-500">有効なキー</div>
          <div className="mt-1 text-2xl font-bold text-slate-900">
            {usage.activeKeys}
          </div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <div className="text-sm text-slate-500">発行済みキー総数</div>
          <div className="mt-1 text-2xl font-bold text-slate-900">
            {usage.totalKeys}
          </div>
        </div>
      </div>

      {/* 発行フォーム */}
      <div className="rounded-xl border border-slate-200 bg-white p-6">
        <h2 className="font-semibold text-slate-900">新しいAPIキーを発行</h2>
        <form onSubmit={handleIssue} className="mt-4 flex flex-wrap items-end gap-3">
          <div className="flex-1 min-w-[220px]">
            <label className="mb-1 block text-sm font-medium text-slate-700">
              ラベル(用途がわかる名前)
            </label>
            <input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="例: 分析基盤バッチ用"
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="rounded-md bg-sky-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-sky-700 disabled:opacity-60"
          >
            {loading ? "発行中..." : "発行する"}
          </button>
        </form>

        {error && (
          <div className="mt-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        {issuedKey && (
          <div className="mt-4 rounded-md border border-amber-300 bg-amber-50 p-4">
            <div className="text-sm font-semibold text-amber-800">
              APIキーを発行しました。この画面を離れると全文は二度と表示されません。今すぐ安全な場所に保存してください。
            </div>
            <div className="mt-2 flex items-center gap-2">
              <code className="flex-1 break-all rounded bg-white px-3 py-2 font-mono text-sm text-slate-900 border border-amber-200">
                {issuedKey}
              </code>
              <button
                onClick={copyIssued}
                className="shrink-0 rounded-md border border-amber-400 bg-white px-3 py-2 text-sm font-medium text-amber-800 hover:bg-amber-100"
              >
                {copied ? "コピー済み" : "コピー"}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* 一覧 */}
      <div className="rounded-xl border border-slate-200 bg-white">
        <div className="border-b border-slate-200 px-6 py-4">
          <h2 className="font-semibold text-slate-900">発行済みAPIキー</h2>
        </div>
        {keys.length === 0 ? (
          <div className="px-6 py-12 text-center text-slate-500">
            まだAPIキーがありません。上のフォームから発行してください。
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-slate-500">
                  <th className="px-6 py-3 font-medium">ラベル</th>
                  <th className="px-6 py-3 font-medium">キー</th>
                  <th className="px-6 py-3 font-medium">呼び出し回数</th>
                  <th className="px-6 py-3 font-medium">作成日</th>
                  <th className="px-6 py-3 font-medium">状態</th>
                  <th className="px-6 py-3 font-medium text-right">操作</th>
                </tr>
              </thead>
              <tbody>
                {keys.map((k) => (
                  <tr key={k.id} className="border-b border-slate-100 last:border-0">
                    <td className="px-6 py-3 font-medium text-slate-900">
                      {k.label}
                    </td>
                    <td className="px-6 py-3">
                      <code className="font-mono text-slate-600">
                        {k.maskedKey}
                      </code>
                    </td>
                    <td className="px-6 py-3 text-slate-700">
                      {k.callCount.toLocaleString()}
                    </td>
                    <td className="px-6 py-3 text-slate-600">
                      {formatDate(k.createdAt)}
                    </td>
                    <td className="px-6 py-3">
                      {k.revoked ? (
                        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500">
                          失効
                        </span>
                      ) : (
                        <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs text-emerald-700">
                          有効
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-3 text-right">
                      {!k.revoked && (
                        <button
                          onClick={() => handleRevoke(k.id)}
                          className="rounded-md border border-red-200 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50"
                        >
                          失効する
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* 使い方 / curl 例 */}
      <ApiUsageDocs origin={origin} />
    </div>
  );
}

function ApiUsageDocs({ origin }: { origin: string }) {
  const example = `# データセット一覧
curl -H "Authorization: Bearer odb_あなたのキー" \\
  "${origin}/api/v1/datasets?q=人口&limit=20"

# メタデータ詳細
curl -H "Authorization: Bearer odb_あなたのキー" \\
  "${origin}/api/v1/datasets/DATASET_ID"

# データ本体(JSON, 既定100件)
curl -H "Authorization: Bearer odb_あなたのキー" \\
  "${origin}/api/v1/datasets/DATASET_ID/data?limit=100&offset=0"

# データ本体(CSV)
curl -H "Authorization: Bearer odb_あなたのキー" \\
  "${origin}/api/v1/datasets/DATASET_ID/data?format=csv"`;

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-6">
      <h2 className="font-semibold text-slate-900">公開APIの使い方</h2>
      <p className="mt-1 text-sm text-slate-600">
        すべてのリクエストに{" "}
        <code className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-xs">
          Authorization: Bearer &lt;APIキー&gt;
        </code>{" "}
        ヘッダを付与してください。公開(PUBLISHED/PUBLIC)データに加え、自組織の
        データにもアクセスできます。詳細は{" "}
        <code className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-xs">
          docs/api.md
        </code>{" "}
        を参照してください。
      </p>
      <pre className="mt-4 overflow-x-auto rounded-lg bg-slate-900 p-4 text-xs leading-relaxed text-slate-100">
        <code>{example}</code>
      </pre>
    </div>
  );
}
