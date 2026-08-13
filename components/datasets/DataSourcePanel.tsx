"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/**
 * 外部データソースの設定パネル。
 *
 * 保存済みの認証値は「設定済みかどうか」だけをサーバーから受け取り、値そのものは
 * クライアントへ渡さない。未入力のまま保存すれば既存の値が維持される。
 */

export type FieldMapRow = { from: string; to: string };

export type SourceConfig = {
  kind: "REST_JSON" | "CSV_URL";
  endpoint: string;
  authType: "NONE" | "BEARER" | "HEADER" | "QUERY";
  authParamName: string;
  hasAuthValue: boolean;
  recordsPath: string;
  fieldMap: FieldMapRow[];
  syncMode: "MANUAL" | "SCHEDULED";
  lastSyncedAt: string | null;
  lastStatus: "SUCCESS" | "FAILED" | null;
  lastMessage: string;
  lastRowCount: number;
};

export type SyncRunRow = {
  id: string;
  status: "SUCCESS" | "FAILED";
  rowCount: number;
  message: string;
  triggeredBy: string;
  startedAt: string;
  durationMs: number;
};

const EMPTY: SourceConfig = {
  kind: "REST_JSON",
  endpoint: "",
  authType: "NONE",
  authParamName: "",
  hasAuthValue: false,
  recordsPath: "",
  fieldMap: [],
  syncMode: "MANUAL",
  lastSyncedAt: null,
  lastStatus: null,
  lastMessage: "",
  lastRowCount: 0,
};

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("ja-JP", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

type Preview = { columns: string[]; rows: string[][]; totalRows: number };

export default function DataSourcePanel({
  datasetId,
  initialConfig,
  initialRuns,
}: {
  datasetId: string;
  initialConfig: SourceConfig | null;
  initialRuns: SyncRunRow[];
}) {
  const router = useRouter();
  const [configured, setConfigured] = useState(initialConfig !== null);
  const [form, setForm] = useState<SourceConfig>(initialConfig ?? EMPTY);
  const [authValue, setAuthValue] = useState("");
  const [open, setOpen] = useState(initialConfig === null);

  const [busy, setBusy] = useState<null | "test" | "save" | "sync" | "remove">(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);

  function update<K extends keyof SourceConfig>(key: K, value: SourceConfig[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  /** 認証値は入力があるときだけ送る(未入力 = 変更しない)。 */
  function payload() {
    return {
      kind: form.kind,
      endpoint: form.endpoint.trim(),
      authType: form.authType,
      authParamName: form.authParamName.trim(),
      ...(authValue !== "" ? { authValue } : {}),
      recordsPath: form.recordsPath.trim(),
      fieldMap: form.fieldMap.filter((m) => m.from.trim() && m.to.trim()),
      syncMode: form.syncMode,
    };
  }

  async function call(
    url: string,
    init: RequestInit,
  ): Promise<{ ok: boolean; data: Record<string, unknown> }> {
    const res = await fetch(url, init);
    const data = await res.json().catch(() => ({}));
    return { ok: res.ok, data };
  }

  async function handleTest() {
    setBusy("test");
    setError(null);
    setNotice(null);
    setPreview(null);
    try {
      const { ok, data } = await call(`/api/datasets/${datasetId}/source/test`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload()),
      });
      if (!ok) {
        setError(String(data.error ?? "接続テストに失敗しました。"));
        return;
      }
      setPreview({
        columns: (data.columns as string[]) ?? [],
        rows: (data.rows as string[][]) ?? [],
        totalRows: Number(data.totalRows ?? 0),
      });
      setNotice(
        `接続に成功しました(${Number(data.totalRows ?? 0).toLocaleString()} 行)。`,
      );
    } catch {
      setError("通信エラーが発生しました。");
    } finally {
      setBusy(null);
    }
  }

  async function handleSave() {
    setBusy("save");
    setError(null);
    setNotice(null);
    try {
      const { ok, data } = await call(`/api/datasets/${datasetId}/source`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload()),
      });
      if (!ok) {
        setError(String(data.error ?? "保存に失敗しました。"));
        return;
      }
      setConfigured(true);
      if (authValue !== "") {
        setForm((prev) => ({ ...prev, hasAuthValue: true }));
        setAuthValue("");
      }
      setNotice("データソースを保存しました。");
      router.refresh();
    } catch {
      setError("通信エラーが発生しました。");
    } finally {
      setBusy(null);
    }
  }

  async function handleSync() {
    setBusy("sync");
    setError(null);
    setNotice(null);
    try {
      const { ok, data } = await call(`/api/datasets/${datasetId}/sync`, {
        method: "POST",
      });
      if (!ok) {
        setError(String(data.error ?? data.message ?? "同期に失敗しました。"));
        return;
      }
      setNotice(String(data.message ?? "同期しました。"));
      router.refresh();
    } catch {
      setError("通信エラーが発生しました。");
    } finally {
      setBusy(null);
    }
  }

  async function handleRemove() {
    if (
      !confirm(
        "データソースの関連付けを解除します。取り込み済みのデータはそのまま残ります。よろしいですか?",
      )
    ) {
      return;
    }
    setBusy("remove");
    setError(null);
    setNotice(null);
    try {
      const { ok, data } = await call(`/api/datasets/${datasetId}/source`, {
        method: "DELETE",
      });
      if (!ok) {
        setError(String(data.error ?? "解除に失敗しました。"));
        return;
      }
      setConfigured(false);
      setForm(EMPTY);
      setPreview(null);
      setNotice("データソースの関連付けを解除しました。");
      router.refresh();
    } catch {
      setError("通信エラーが発生しました。");
    } finally {
      setBusy(null);
    }
  }

  const needsParamName = form.authType === "HEADER" || form.authType === "QUERY";

  return (
    <div className="rounded-xl border border-slate-200 bg-white">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-6 py-4">
        <div>
          <h2 className="font-semibold text-slate-900">外部データソース</h2>
          <p className="mt-0.5 text-sm text-slate-600">
            外部の API や CSV の URL を関連付けると、そこから随時データを取り込めます。
            取り込んだ内容は CSV アップロードと同じ扱いになり、カタログ・マージ・公開 API
            でそのまま利用できます。
          </p>
        </div>
        <button
          onClick={() => setOpen((v) => !v)}
          className="shrink-0 rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          {open ? "閉じる" : configured ? "設定を見る" : "設定する"}
        </button>
      </div>

      {/* 現在の状態 */}
      {configured && (
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 border-b border-slate-200 bg-slate-50 px-6 py-3 text-sm">
          <span className="text-slate-600">
            最終同期:{" "}
            <span className="font-medium text-slate-800">
              {form.lastSyncedAt ? formatDateTime(form.lastSyncedAt) : "未実行"}
            </span>
          </span>
          {form.lastStatus && (
            <span
              className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                form.lastStatus === "SUCCESS"
                  ? "bg-emerald-100 text-emerald-700"
                  : "bg-red-100 text-red-700"
              }`}
            >
              {form.lastStatus === "SUCCESS" ? "成功" : "失敗"}
            </span>
          )}
          <span className="text-slate-600">
            同期方法:{" "}
            <span className="font-medium text-slate-800">
              {form.syncMode === "SCHEDULED" ? "定期(毎日)+ 手動" : "手動のみ"}
            </span>
          </span>
          <button
            onClick={handleSync}
            disabled={busy !== null}
            className="ml-auto rounded-md bg-sky-600 px-4 py-1.5 text-sm font-semibold text-white hover:bg-sky-700 disabled:opacity-60"
          >
            {busy === "sync" ? "同期中..." : "今すぐ同期"}
          </button>
        </div>
      )}

      {(error || notice) && (
        <div className="px-6 pt-4">
          {error && (
            <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}
          {notice && !error && (
            <div className="rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
              {notice}
            </div>
          )}
        </div>
      )}

      {open && (
        <div className="space-y-5 px-6 py-5">
          {/* 取得方式 */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">
                取得方式
              </label>
              <select
                value={form.kind}
                onChange={(e) =>
                  update("kind", e.target.value as SourceConfig["kind"])
                }
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              >
                <option value="REST_JSON">REST API(JSON)</option>
                <option value="CSV_URL">CSV の URL</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">
                同期方法
              </label>
              <select
                value={form.syncMode}
                onChange={(e) =>
                  update("syncMode", e.target.value as SourceConfig["syncMode"])
                }
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              >
                <option value="MANUAL">手動のみ</option>
                <option value="SCHEDULED">定期(毎日)+ 手動</option>
              </select>
            </div>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">
              取得先 URL
            </label>
            <input
              value={form.endpoint}
              onChange={(e) => update("endpoint", e.target.value)}
              placeholder="https://example.jp/api/3/action/datastore_search?resource_id=..."
              className="w-full rounded-md border border-slate-300 px-3 py-2 font-mono text-sm"
            />
            <p className="mt-1 text-xs text-slate-500">
              http / https のみ。内部ネットワーク宛の URL は指定できません。
            </p>
          </div>

          {form.kind === "REST_JSON" && (
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">
                レコードの位置(任意)
              </label>
              <input
                value={form.recordsPath}
                onChange={(e) => update("recordsPath", e.target.value)}
                placeholder="result.records"
                className="w-full rounded-md border border-slate-300 px-3 py-2 font-mono text-sm"
              />
              <p className="mt-1 text-xs text-slate-500">
                レスポンス内で配列が入っている場所をドット区切りで指定します(CKAN なら{" "}
                <code className="rounded bg-slate-100 px-1">result.records</code>)。
                レスポンス直下が配列なら空のままで構いません。
              </p>
            </div>
          )}

          {/* 認証 */}
          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">
                認証方式
              </label>
              <select
                value={form.authType}
                onChange={(e) =>
                  update("authType", e.target.value as SourceConfig["authType"])
                }
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              >
                <option value="NONE">なし</option>
                <option value="BEARER">Bearer トークン</option>
                <option value="HEADER">任意のヘッダ</option>
                <option value="QUERY">クエリパラメータ</option>
              </select>
            </div>
            {needsParamName && (
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">
                  {form.authType === "HEADER" ? "ヘッダ名" : "パラメータ名"}
                </label>
                <input
                  value={form.authParamName}
                  onChange={(e) => update("authParamName", e.target.value)}
                  placeholder={form.authType === "HEADER" ? "X-API-Key" : "api_key"}
                  className="w-full rounded-md border border-slate-300 px-3 py-2 font-mono text-sm"
                />
              </div>
            )}
            {form.authType !== "NONE" && (
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">
                  認証値
                </label>
                <input
                  type="password"
                  value={authValue}
                  onChange={(e) => setAuthValue(e.target.value)}
                  placeholder={
                    form.hasAuthValue ? "(設定済み・変更する場合のみ入力)" : "APIキーなど"
                  }
                  className="w-full rounded-md border border-slate-300 px-3 py-2 font-mono text-sm"
                />
                <p className="mt-1 text-xs text-slate-500">
                  暗号化して保存され、画面には二度と表示されません。
                </p>
              </div>
            )}
          </div>

          {/* 列マッピング */}
          <div>
            <div className="mb-1 flex items-center justify-between">
              <label className="block text-sm font-medium text-slate-700">
                列マッピング(任意)
              </label>
              <button
                onClick={() =>
                  update("fieldMap", [...form.fieldMap, { from: "", to: "" }])
                }
                className="text-sm font-medium text-sky-700 hover:text-sky-800"
              >
                + 行を追加
              </button>
            </div>
            <p className="mb-2 text-xs text-slate-500">
              指定しない場合は取得元のキー(CSV ならヘッダー)をそのまま列名にします。
              必要な列だけを選びたい場合や、列名を日本語に直したい場合に使います。
            </p>
            {form.fieldMap.length > 0 && (
              <div className="space-y-2">
                {form.fieldMap.map((row, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <input
                      value={row.from}
                      onChange={(e) => {
                        const next = [...form.fieldMap];
                        next[i] = { ...next[i], from: e.target.value };
                        update("fieldMap", next);
                      }}
                      placeholder="取得元のキー"
                      className="flex-1 rounded-md border border-slate-300 px-3 py-1.5 font-mono text-sm"
                    />
                    <span className="text-slate-400">→</span>
                    <input
                      value={row.to}
                      onChange={(e) => {
                        const next = [...form.fieldMap];
                        next[i] = { ...next[i], to: e.target.value };
                        update("fieldMap", next);
                      }}
                      placeholder="保存する列名"
                      className="flex-1 rounded-md border border-slate-300 px-3 py-1.5 text-sm"
                    />
                    <button
                      onClick={() =>
                        update(
                          "fieldMap",
                          form.fieldMap.filter((_, idx) => idx !== i),
                        )
                      }
                      className="shrink-0 rounded-md border border-slate-300 px-2 py-1.5 text-xs text-slate-600 hover:bg-slate-50"
                    >
                      削除
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* 操作 */}
          <div className="flex flex-wrap items-center gap-3 border-t border-slate-200 pt-4">
            <button
              onClick={handleTest}
              disabled={busy !== null || !form.endpoint.trim()}
              className="rounded-md border border-sky-300 bg-white px-4 py-2 text-sm font-semibold text-sky-700 hover:bg-sky-50 disabled:opacity-60"
            >
              {busy === "test" ? "テスト中..." : "接続テスト"}
            </button>
            <button
              onClick={handleSave}
              disabled={busy !== null || !form.endpoint.trim()}
              className="rounded-md bg-sky-600 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-700 disabled:opacity-60"
            >
              {busy === "save" ? "保存中..." : "保存"}
            </button>
            {configured && (
              <button
                onClick={handleRemove}
                disabled={busy !== null}
                className="ml-auto rounded-md border border-red-200 px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-60"
              >
                {busy === "remove" ? "解除中..." : "関連付けを解除"}
              </button>
            )}
          </div>

          {/* 接続テスト結果 */}
          {preview && (
            <div className="rounded-lg border border-slate-200">
              <div className="border-b border-slate-200 px-4 py-2 text-sm font-medium text-slate-700">
                取得プレビュー(先頭 {preview.rows.length} 行 / 全{" "}
                {preview.totalRows.toLocaleString()} 行)
              </div>
              {preview.columns.length === 0 ? (
                <div className="px-4 py-6 text-center text-sm text-slate-500">
                  列を判別できませんでした。レコードの位置や列マッピングを確認してください。
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-200 bg-slate-50 text-left text-slate-600">
                        {preview.columns.map((c) => (
                          <th key={c} className="whitespace-nowrap px-3 py-2 font-medium">
                            {c}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {preview.rows.map((row, i) => (
                        <tr key={i} className="border-b border-slate-100 last:border-0">
                          {preview.columns.map((_, ci) => (
                            <td
                              key={ci}
                              className="max-w-xs truncate px-3 py-1.5 text-slate-700"
                            >
                              {row[ci] ?? ""}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* 同期履歴 */}
      {configured && initialRuns.length > 0 && (
        <div className="border-t border-slate-200 px-6 py-4">
          <h3 className="mb-2 text-sm font-semibold text-slate-800">同期履歴</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-slate-500">
                  <th className="py-2 pr-4 font-medium">日時</th>
                  <th className="py-2 pr-4 font-medium">結果</th>
                  <th className="py-2 pr-4 font-medium">行数</th>
                  <th className="py-2 pr-4 font-medium">実行</th>
                  <th className="py-2 font-medium">メッセージ</th>
                </tr>
              </thead>
              <tbody>
                {initialRuns.map((run) => (
                  <tr key={run.id} className="border-b border-slate-100 last:border-0">
                    <td className="whitespace-nowrap py-2 pr-4 text-slate-600">
                      {formatDateTime(run.startedAt)}
                    </td>
                    <td className="py-2 pr-4">
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                          run.status === "SUCCESS"
                            ? "bg-emerald-100 text-emerald-700"
                            : "bg-red-100 text-red-700"
                        }`}
                      >
                        {run.status === "SUCCESS" ? "成功" : "失敗"}
                      </span>
                    </td>
                    <td className="py-2 pr-4 text-slate-700">
                      {run.rowCount.toLocaleString()}
                    </td>
                    <td className="py-2 pr-4 text-slate-600">
                      {run.triggeredBy === "scheduled" ? "定期" : "手動"}
                    </td>
                    <td className="py-2 text-slate-600">{run.message}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
