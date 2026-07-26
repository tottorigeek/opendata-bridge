"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { NORMALIZATION_LEVELS, type NormalizationLevel } from "@/lib/merge/normalize";

export type MergeDatasetItem = {
  id: string;
  title: string;
  columns: string[];
  rowCount: number;
  own: boolean;
  status: string;
  visibility: string;
  sourceType: string;
  hasFile: boolean;
};

type JoinType = "inner" | "left" | "full";
type OutputColumn = { source: "A" | "B"; column: string };

type Stats = {
  totalRowsA: number;
  totalRowsB: number;
  outputRows: number;
  matchedRowsA: number;
  matchRate: number;
  unmatchedSamples: {
    side: "A" | "B";
    key: string;
    normalizedKey: string;
    row: Record<string, string>;
  }[];
};

type PreviewResponse = {
  columns: string[];
  sampleRows: Record<string, string>[];
  stats: Stats;
  previewLimit: number;
  fullRowsA: number;
  fullRowsB: number;
};

type ExecuteResponse = {
  ok: true;
  datasetId: string;
  title: string;
  description: string;
  rowCount: number;
  stats: Stats;
};

const JOIN_OPTIONS: { value: JoinType; label: string; hint: string }[] = [
  { value: "inner", label: "内部結合 (inner)", hint: "両方でマッチした行のみ" },
  { value: "left", label: "左外部結合 (left)", hint: "A の全行 + マッチした B" },
  { value: "full", label: "完全外部結合 (full)", hint: "A と B の全行" },
];

function DatasetBadge({ ds }: { ds: MergeDatasetItem }) {
  return (
    <span
      className={`ml-2 rounded-full px-2 py-0.5 text-xs ${
        ds.own ? "bg-sky-100 text-sky-700" : "bg-emerald-100 text-emerald-700"
      }`}
    >
      {ds.own ? "自組織" : "公開データ"}
    </span>
  );
}

export default function MergeWizard({ datasets }: { datasets: MergeDatasetItem[] }) {
  const [step, setStep] = useState(1);

  const [aId, setAId] = useState("");
  const [bId, setBId] = useState("");
  const [keyA, setKeyA] = useState("");
  const [keyB, setKeyB] = useState("");
  const [level, setLevel] = useState<NormalizationLevel>("address");
  const [joinType, setJoinType] = useState<JoinType>("inner");
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const [preview, setPreview] = useState<PreviewResponse | null>(null);
  const [executed, setExecuted] = useState<ExecuteResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const dsA = useMemo(() => datasets.find((d) => d.id === aId) ?? null, [datasets, aId]);
  const dsB = useMemo(() => datasets.find((d) => d.id === bId) ?? null, [datasets, bId]);

  // 選択可能な出力列の一覧(A→B)。列キーは "A::col" / "B::col"。
  const outputCandidates = useMemo<{ key: string; col: OutputColumn; label: string }[]>(() => {
    const list: { key: string; col: OutputColumn; label: string }[] = [];
    if (dsA) {
      for (const c of dsA.columns) {
        list.push({ key: `A::${c}`, col: { source: "A", column: c }, label: c });
      }
    }
    if (dsB) {
      for (const c of dsB.columns) {
        list.push({ key: `B::${c}`, col: { source: "B", column: c }, label: c });
      }
    }
    return list;
  }, [dsA, dsB]);

  function initSelectionForStep2() {
    // 既定で全列を選択。
    setSelected(new Set(outputCandidates.map((o) => o.key)));
  }

  const outputColumns: OutputColumn[] = useMemo(
    () => outputCandidates.filter((o) => selected.has(o.key)).map((o) => o.col),
    [outputCandidates, selected],
  );

  function requestBody() {
    return {
      datasetAId: aId,
      datasetBId: bId,
      keyA,
      keyB,
      level,
      joinType,
      outputColumns,
    };
  }

  async function runPreview() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/merge/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody()),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "プレビューに失敗しました。");
        return;
      }
      setPreview(data as PreviewResponse);
      setStep(3);
    } catch {
      setError("通信に失敗しました。");
    } finally {
      setLoading(false);
    }
  }

  async function runExecute() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/merge/execute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody()),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "マージ実行に失敗しました。");
        return;
      }
      setExecuted(data as ExecuteResponse);
      setStep(4);
    } catch {
      setError("通信に失敗しました。");
    } finally {
      setLoading(false);
    }
  }

  const step1Valid = aId && bId && aId !== bId && dsA?.hasFile && dsB?.hasFile;
  const step2Valid = keyA && keyB && outputColumns.length > 0;

  return (
    <div className="mt-6">
      <StepIndicator step={step} />

      {error && (
        <div className="mt-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* ステップ1: データセット選択 */}
      {step === 1 && (
        <section className="mt-6 space-y-6 rounded-xl border border-slate-200 bg-white p-6">
          <h2 className="font-semibold text-slate-900">1. データセットを 2 つ選ぶ</h2>
          {datasets.length < 2 && (
            <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-700">
              マージにはデータセットが 2 件以上必要です。データセットを登録してください。
            </p>
          )}
          <div className="grid gap-6 sm:grid-cols-2">
            <DatasetSelect
              label="データセット A(左)"
              value={aId}
              onChange={(v) => {
                setAId(v);
                setKeyA("");
                setPreview(null);
              }}
              datasets={datasets}
              disabledId={bId}
            />
            <DatasetSelect
              label="データセット B(右)"
              value={bId}
              onChange={(v) => {
                setBId(v);
                setKeyB("");
                setPreview(null);
              }}
              datasets={datasets}
              disabledId={aId}
            />
          </div>
          {dsA && !dsA.hasFile && (
            <p className="text-sm text-red-600">A に CSV ファイルが紐付いていません。</p>
          )}
          {dsB && !dsB.hasFile && (
            <p className="text-sm text-red-600">B に CSV ファイルが紐付いていません。</p>
          )}
          <div className="flex justify-end">
            <button
              type="button"
              disabled={!step1Valid}
              onClick={() => {
                initSelectionForStep2();
                setStep(2);
              }}
              className="rounded-md bg-sky-600 px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:bg-slate-300"
            >
              次へ
            </button>
          </div>
        </section>
      )}

      {/* ステップ2: キー・正規化・結合・出力列 */}
      {step === 2 && dsA && dsB && (
        <section className="mt-6 space-y-6 rounded-xl border border-slate-200 bg-white p-6">
          <h2 className="font-semibold text-slate-900">2. 結合条件を指定する</h2>

          <div className="grid gap-6 sm:grid-cols-2">
            <ColumnSelect
              label={`キー列(${dsA.title})`}
              columns={dsA.columns}
              value={keyA}
              onChange={setKeyA}
            />
            <ColumnSelect
              label={`キー列(${dsB.title})`}
              columns={dsB.columns}
              value={keyB}
              onChange={setKeyB}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700">正規化レベル</label>
            <select
              value={level}
              onChange={(e) => setLevel(e.target.value as NormalizationLevel)}
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            >
              {NORMALIZATION_LEVELS.map((l) => (
                <option key={l.value} value={l.value}>
                  {l.label}
                </option>
              ))}
            </select>
            <p className="mt-1 text-xs text-slate-500">
              {NORMALIZATION_LEVELS.find((l) => l.value === level)?.description}
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700">結合タイプ</label>
            <div className="mt-2 grid gap-2 sm:grid-cols-3">
              {JOIN_OPTIONS.map((j) => (
                <label
                  key={j.value}
                  className={`cursor-pointer rounded-md border px-3 py-2 text-sm ${
                    joinType === j.value
                      ? "border-sky-400 bg-sky-50 text-sky-800"
                      : "border-slate-300 text-slate-700"
                  }`}
                >
                  <input
                    type="radio"
                    name="joinType"
                    className="mr-2"
                    checked={joinType === j.value}
                    onChange={() => setJoinType(j.value)}
                  />
                  {j.label}
                  <span className="mt-0.5 block text-xs text-slate-500">{j.hint}</span>
                </label>
              ))}
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between">
              <label className="block text-sm font-medium text-slate-700">
                出力列({outputColumns.length} 列選択中)
              </label>
              <div className="space-x-3 text-xs">
                <button
                  type="button"
                  className="text-sky-600 hover:underline"
                  onClick={() => setSelected(new Set(outputCandidates.map((o) => o.key)))}
                >
                  全選択
                </button>
                <button
                  type="button"
                  className="text-slate-500 hover:underline"
                  onClick={() => setSelected(new Set())}
                >
                  全解除
                </button>
              </div>
            </div>
            <div className="mt-2 grid max-h-56 gap-1 overflow-y-auto rounded-md border border-slate-200 p-3 sm:grid-cols-2">
              {outputCandidates.map((o) => (
                <label key={o.key} className="flex items-center gap-2 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    checked={selected.has(o.key)}
                    onChange={(e) => {
                      const next = new Set(selected);
                      if (e.target.checked) next.add(o.key);
                      else next.delete(o.key);
                      setSelected(next);
                    }}
                  />
                  <span
                    className={`rounded px-1 text-xs ${
                      o.col.source === "A"
                        ? "bg-sky-100 text-sky-700"
                        : "bg-emerald-100 text-emerald-700"
                    }`}
                  >
                    {o.col.source}
                  </span>
                  {o.label}
                </label>
              ))}
            </div>
            <p className="mt-1 text-xs text-slate-500">
              同名の列は「データセット名_列名」に自動リネームされます。
            </p>
          </div>

          <div className="flex justify-between">
            <button
              type="button"
              onClick={() => setStep(1)}
              className="rounded-md border border-slate-300 px-4 py-2 text-sm text-slate-700"
            >
              戻る
            </button>
            <button
              type="button"
              disabled={!step2Valid || loading}
              onClick={runPreview}
              className="rounded-md bg-sky-600 px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:bg-slate-300"
            >
              {loading ? "実行中…" : "プレビュー(先頭100行)"}
            </button>
          </div>
        </section>
      )}

      {/* ステップ3: プレビュー */}
      {step === 3 && preview && (
        <section className="mt-6 space-y-6 rounded-xl border border-slate-200 bg-white p-6">
          <h2 className="font-semibold text-slate-900">3. プレビュー結果</h2>
          <StatsPanel stats={preview.stats} note={`先頭 ${preview.previewLimit} 行での試行`} />

          <div>
            <h3 className="text-sm font-medium text-slate-700">
              サンプル結果({preview.sampleRows.length} 行)
            </h3>
            <ResultTable columns={preview.columns} rows={preview.sampleRows} />
          </div>

          {preview.stats.unmatchedSamples.length > 0 && (
            <UnmatchedPanel samples={preview.stats.unmatchedSamples} />
          )}

          <div className="flex justify-between">
            <button
              type="button"
              onClick={() => setStep(2)}
              className="rounded-md border border-slate-300 px-4 py-2 text-sm text-slate-700"
            >
              条件を変更
            </button>
            <button
              type="button"
              disabled={loading}
              onClick={runExecute}
              className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white disabled:bg-slate-300"
            >
              {loading ? "保存中…" : "全行でマージを実行して保存"}
            </button>
          </div>
        </section>
      )}

      {/* ステップ4: 完了 */}
      {step === 4 && executed && (
        <section className="mt-6 space-y-4 rounded-xl border border-emerald-200 bg-emerald-50 p-6">
          <h2 className="font-semibold text-emerald-800">マージが完了しました</h2>
          <p className="text-sm text-slate-700">
            新しいデータセット「{executed.title}」を作成しました({executed.rowCount} 行)。
          </p>
          <p className="rounded-md bg-white px-3 py-2 text-sm text-slate-600">
            {executed.description}
          </p>
          <StatsPanel stats={executed.stats} note="全行での実行結果" />
          <div className="flex gap-3">
            <Link
              href="/dashboard/datasets"
              className="rounded-md bg-sky-600 px-4 py-2 text-sm font-medium text-white"
            >
              データセット一覧へ
            </Link>
            <button
              type="button"
              onClick={() => {
                setStep(1);
                setPreview(null);
                setExecuted(null);
                setError(null);
              }}
              className="rounded-md border border-slate-300 px-4 py-2 text-sm text-slate-700"
            >
              続けて別のマージを行う
            </button>
          </div>
        </section>
      )}
    </div>
  );
}

function StepIndicator({ step }: { step: number }) {
  const labels = ["データセット選択", "結合条件", "プレビュー", "完了"];
  return (
    <ol className="flex flex-wrap gap-2 text-sm">
      {labels.map((label, i) => {
        const n = i + 1;
        const active = n === step;
        const done = n < step;
        return (
          <li
            key={label}
            className={`flex items-center gap-2 rounded-full px-3 py-1 ${
              active
                ? "bg-sky-600 text-white"
                : done
                  ? "bg-sky-100 text-sky-700"
                  : "bg-slate-100 text-slate-500"
            }`}
          >
            <span className="font-semibold">{n}</span>
            {label}
          </li>
        );
      })}
    </ol>
  );
}

function DatasetSelect({
  label,
  value,
  onChange,
  datasets,
  disabledId,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  datasets: MergeDatasetItem[];
  disabledId: string;
}) {
  const current = datasets.find((d) => d.id === value);
  return (
    <div>
      <label className="block text-sm font-medium text-slate-700">{label}</label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
      >
        <option value="">選択してください</option>
        {datasets.map((d) => (
          <option key={d.id} value={d.id} disabled={d.id === disabledId}>
            {d.title}({d.own ? "自組織" : "公開"}・{d.rowCount}行)
          </option>
        ))}
      </select>
      {current && (
        <p className="mt-1 flex flex-wrap items-center text-xs text-slate-500">
          列: {current.columns.join(", ") || "(なし)"}
          <DatasetBadge ds={current} />
        </p>
      )}
    </div>
  );
}

function ColumnSelect({
  label,
  columns,
  value,
  onChange,
}: {
  label: string;
  columns: string[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-slate-700">{label}</label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
      >
        <option value="">選択してください</option>
        {columns.map((c) => (
          <option key={c} value={c}>
            {c}
          </option>
        ))}
      </select>
    </div>
  );
}

function StatsPanel({ stats, note }: { stats: Stats; note: string }) {
  const pct = (stats.matchRate * 100).toFixed(1);
  return (
    <div className="grid gap-3 sm:grid-cols-4">
      <StatCard label="マッチ率" value={`${pct}%`} highlight />
      <StatCard label="出力行数" value={String(stats.outputRows)} />
      <StatCard
        label="マッチ行 (A基準)"
        value={`${stats.matchedRowsA} / ${stats.totalRowsA}`}
      />
      <StatCard label="A / B 行数" value={`${stats.totalRowsA} / ${stats.totalRowsB}`} />
      <p className="col-span-full text-xs text-slate-500">{note}</p>
    </div>
  );
}

function StatCard({
  label,
  value,
  highlight,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div
      className={`rounded-lg border p-3 ${
        highlight ? "border-sky-300 bg-sky-50" : "border-slate-200 bg-white"
      }`}
    >
      <div className="text-xs text-slate-500">{label}</div>
      <div
        className={`mt-1 text-lg font-bold ${highlight ? "text-sky-700" : "text-slate-900"}`}
      >
        {value}
      </div>
    </div>
  );
}

function ResultTable({
  columns,
  rows,
}: {
  columns: string[];
  rows: Record<string, string>[];
}) {
  if (rows.length === 0) {
    return (
      <p className="mt-2 rounded-md border border-dashed border-slate-300 p-4 text-center text-sm text-slate-500">
        結果行がありません。
      </p>
    );
  }
  return (
    <div className="mt-2 overflow-x-auto rounded-md border border-slate-200">
      <table className="min-w-full text-xs">
        <thead className="bg-slate-50">
          <tr>
            {columns.map((c) => (
              <th key={c} className="whitespace-nowrap px-3 py-2 text-left font-medium text-slate-600">
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className="border-t border-slate-100">
              {columns.map((c) => (
                <td key={c} className="whitespace-nowrap px-3 py-1.5 text-slate-700">
                  {row[c] ?? ""}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function UnmatchedPanel({
  samples,
}: {
  samples: Stats["unmatchedSamples"];
}) {
  return (
    <div>
      <h3 className="text-sm font-medium text-slate-700">アンマッチ例(先頭10件)</h3>
      <div className="mt-2 space-y-1">
        {samples.map((s, i) => (
          <div
            key={i}
            className="flex items-center gap-2 rounded-md bg-slate-50 px-3 py-1.5 text-xs text-slate-600"
          >
            <span
              className={`rounded px-1 ${
                s.side === "A"
                  ? "bg-sky-100 text-sky-700"
                  : "bg-emerald-100 text-emerald-700"
              }`}
            >
              {s.side}
            </span>
            <span className="font-medium text-slate-800">{s.key || "(空)"}</span>
            <span className="text-slate-400">→ 正規化: {s.normalizedKey || "(空)"}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
