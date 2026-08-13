import Link from "next/link";
import type { LineageView } from "@/lib/merge/lineage";

const KIND_LABEL: Record<string, string> = {
  extend: "項目拡張型",
  intersect: "共通抽出型",
};

function formatDateTime(d: Date): string {
  return new Intl.DateTimeFormat("ja-JP", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

/**
 * マージ結果の来歴表示。
 *
 * 元データセットへのリンクに加え、マージ時点のライセンスと組織名を出す。
 * 元が削除されていてもこの表示は壊れない(来歴に当時の値を写しているため)。
 */
export default function LineagePanel({
  lineage,
  linkBase,
}: {
  lineage: LineageView;
  /** 元データセットへのリンク先の接頭辞(カタログ or ダッシュボード)。 */
  linkBase: "/catalog" | "/dashboard/datasets";
}) {
  const analysis = lineage.analysis;
  const pct = (v: number) => `${(v * 100).toFixed(1)}%`;

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-6">
      <h2 className="text-lg font-semibold text-slate-900">出典(マージの来歴)</h2>
      <p className="mt-1 text-sm text-slate-600">
        {KIND_LABEL[lineage.kind] ?? lineage.kind}・キー: {lineage.keyA} ⇔ {lineage.keyB}
        ・正規化: {lineage.level}・{formatDateTime(lineage.createdAt)} 実行
      </p>

      <ul className="mt-4 space-y-2">
        {lineage.inputs.map((input) => (
          <li
            key={`${input.side}-${input.title}`}
            className="rounded-lg border border-slate-200 p-3 text-sm"
          >
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
                {input.side}
              </span>
              {input.available && input.datasetId ? (
                <Link
                  href={`${linkBase}/${input.datasetId}`}
                  className="font-medium text-sky-700 hover:underline"
                >
                  {input.title}
                </Link>
              ) : (
                <span className="font-medium text-slate-800">
                  {input.title}
                  <span className="ml-1 text-xs font-normal text-slate-500">
                    (元データは削除されています)
                  </span>
                </span>
              )}
            </div>
            <p className="mt-1 text-xs text-slate-500">
              {input.organizationName}・ライセンス: {input.license || "未設定"}・
              {input.rowCount.toLocaleString("ja-JP")} 行(マージ時点)
            </p>
          </li>
        ))}
      </ul>

      {analysis && (
        <dl className="mt-4 grid gap-x-6 gap-y-1 text-xs text-slate-600 sm:grid-cols-2">
          <div className="flex justify-between">
            <dt>カバー率 (A / B)</dt>
            <dd>
              {pct(analysis.a.coverage)} / {pct(analysis.b.coverage)}
            </dd>
          </div>
          <div className="flex justify-between">
            <dt>重なり (Jaccard)</dt>
            <dd>{pct(analysis.jaccard)}</dd>
          </div>
          <div className="flex justify-between">
            <dt>正規化の寄与</dt>
            <dd>
              {pct(analysis.exactCoverageA)} → {pct(analysis.a.coverage)}
            </dd>
          </div>
          <div className="flex justify-between">
            <dt>1 行あたりの対応数(平均)</dt>
            <dd>{analysis.multiplicity.mean.toFixed(1)}</dd>
          </div>
        </dl>
      )}

      {lineage.columnOrigins.length > 0 && (
        <details className="mt-4">
          <summary className="cursor-pointer text-sm text-slate-700">
            列ごとの出典({lineage.columnOrigins.length} 列)
          </summary>
          <ul className="mt-2 grid gap-1 text-xs text-slate-600 sm:grid-cols-2">
            {lineage.columnOrigins.map((origin) => (
              <li key={origin.name} className="flex justify-between gap-2">
                <span className="truncate">{origin.name}</span>
                <span className="shrink-0 text-slate-400">
                  {origin.source} · {origin.column}
                </span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}
