import type { DatasetVersion } from "@prisma/client";
import { VERSION_SOURCE_LABEL } from "@/lib/versions";

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
 * 版の履歴。
 *
 * 版の識別子は連番で、日付は表示に添えるだけにしている。日付を識別子にすると
 * 同日の複数更新で衝突し、「データの基準日」とも混同されるため。
 */
export default function VersionHistory({
  datasetId,
  versions,
}: {
  datasetId: string;
  versions: DatasetVersion[];
}) {
  if (versions.length === 0) return null;

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-6">
      <h2 className="text-lg font-semibold text-slate-900">版の履歴</h2>
      <p className="mt-1 text-sm text-slate-600">
        CSV を差し替えたり、外部データソースから取り込むたびに版が増えます。
        過去の版もそのまま取得できます。
      </p>

      <ul className="mt-4 divide-y divide-slate-100">
        {versions.map((version, index) => (
          <li
            key={version.id}
            className="flex flex-wrap items-center justify-between gap-2 py-3"
          >
            <div className="min-w-0">
              <p className="text-sm font-medium text-slate-900">
                第 {version.number} 版
                {index === 0 && (
                  <span className="ml-2 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700">
                    最新
                  </span>
                )}
                <span className="ml-2 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-normal text-slate-600">
                  {VERSION_SOURCE_LABEL[version.source] ?? version.source}
                </span>
              </p>
              <p className="mt-0.5 text-xs text-slate-500">
                {formatDateTime(version.createdAt)}・
                {version.rowCount.toLocaleString("ja-JP")} 行
                {version.note && `・${version.note}`}
              </p>
            </div>
            <a
              href={`/api/datasets/${datasetId}/download?version=${version.number}`}
              className="shrink-0 text-sm font-medium text-sky-700 hover:text-sky-800"
            >
              この版を取得
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}
