import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import {
  getOwnedDataset,
  parseTags,
  STATUS_LABEL,
  STATUS_BADGE_CLASS,
  VISIBILITY_LABEL,
} from "@/lib/datasets";
import { readCsvPreview } from "@/lib/csv";
import { prisma } from "@/lib/prisma";
import { parseFieldMap } from "@/lib/sources/transform";
import CsvPreviewTable from "@/components/datasets/CsvPreviewTable";
import DatasetDetailActions from "@/components/datasets/DatasetDetailActions";
import LineagePanel from "@/components/datasets/LineagePanel";
import { getLineage } from "@/lib/merge/lineage";
import DataSourcePanel, {
  type SourceConfig,
  type SyncRunRow,
} from "@/components/datasets/DataSourcePanel";

function formatDateTime(d: Date): string {
  return new Intl.DateTimeFormat("ja-JP", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

export default async function DatasetDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const { id } = await params;
  const dataset = await getOwnedDataset(id, user);
  if (!dataset) notFound();

  const preview = dataset.filePath
    ? await readCsvPreview(dataset.id, 50)
    : { columns: [], rows: [], totalRows: 0 };
  const tags = parseTags(dataset.tags);
  // マージ由来なら、どの出典から作られたかを併せて示す。
  const lineage =
    dataset.sourceType === "MERGED" ? await getLineage(dataset.id) : null;

  const source = await prisma.dataSource.findUnique({
    where: { datasetId: dataset.id },
    include: { runs: { orderBy: { startedAt: "desc" }, take: 10 } },
  });

  // 認証値(暗号文)はクライアントへ渡さない。設定済みかどうかだけを伝える。
  const sourceConfig: SourceConfig | null = source
    ? {
        kind: source.kind,
        endpoint: source.endpoint,
        authType: source.authType,
        authParamName: source.authParamName,
        hasAuthValue: source.authValueEnc.length > 0,
        recordsPath: source.recordsPath,
        fieldMap: parseFieldMap(source.fieldMapJson),
        syncMode: source.syncMode,
        lastSyncedAt: source.lastSyncedAt?.toISOString() ?? null,
        lastStatus: source.lastStatus,
        lastMessage: source.lastMessage,
        lastRowCount: source.lastRowCount,
      }
    : null;

  const syncRuns: SyncRunRow[] =
    source?.runs.map((run) => ({
      id: run.id,
      status: run.status,
      rowCount: run.rowCount,
      message: run.message,
      triggeredBy: run.triggeredBy,
      startedAt: run.startedAt.toISOString(),
      durationMs: run.durationMs,
    })) ?? [];

  return (
    <div>
      <nav className="text-sm text-slate-500">
        <Link href="/dashboard/datasets" className="hover:text-sky-700">
          データセット
        </Link>
        <span className="mx-1.5">/</span>
        <span className="text-slate-700">{dataset.title}</span>
      </nav>

      <div className="mt-2 flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-slate-900">{dataset.title}</h1>
            <span
              className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
                STATUS_BADGE_CLASS[dataset.status]
              }`}
            >
              {STATUS_LABEL[dataset.status]}
            </span>
          </div>
          {dataset.description && (
            <p className="mt-2 max-w-2xl whitespace-pre-wrap text-slate-600">
              {dataset.description}
            </p>
          )}
        </div>
        <Link
          href={`/dashboard/datasets/${dataset.id}/edit`}
          className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          編集
        </Link>
      </div>

      {dataset.status === "REJECTED" && (
        <div className="mt-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          このデータセットは差し戻されました。内容を修正して再度公開申請できます。
        </div>
      )}

      {/* メタデータ */}
      <dl className="mt-6 grid gap-x-8 gap-y-4 rounded-xl border border-slate-200 bg-white p-6 sm:grid-cols-2">
        <div>
          <dt className="text-xs font-medium text-slate-500">公開範囲</dt>
          <dd className="mt-0.5 text-sm text-slate-800">
            {VISIBILITY_LABEL[dataset.visibility]}
          </dd>
        </div>
        <div>
          <dt className="text-xs font-medium text-slate-500">ライセンス</dt>
          <dd className="mt-0.5 text-sm text-slate-800">
            {dataset.licenseUnresolved || !dataset.license ? (
              <span className="text-amber-700">
                未確定
                <span className="ml-1 text-xs">
                  (設定するまで公開申請できません)
                </span>
              </span>
            ) : (
              dataset.license
            )}
          </dd>
        </div>
        <div>
          <dt className="text-xs font-medium text-slate-500">更新頻度</dt>
          <dd className="mt-0.5 text-sm text-slate-800">
            {dataset.updateFrequency}
          </dd>
        </div>
        <div>
          <dt className="text-xs font-medium text-slate-500">行数</dt>
          <dd className="mt-0.5 text-sm text-slate-800">
            {dataset.rowCount.toLocaleString("ja-JP")} 行
          </dd>
        </div>
        <div className="sm:col-span-2">
          <dt className="text-xs font-medium text-slate-500">タグ</dt>
          <dd className="mt-1 flex flex-wrap gap-1.5">
            {tags.length > 0 ? (
              tags.map((t) => (
                <span
                  key={t}
                  className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs text-slate-600"
                >
                  {t}
                </span>
              ))
            ) : (
              <span className="text-sm text-slate-400">なし</span>
            )}
          </dd>
        </div>
        <div className="sm:col-span-2">
          <dt className="text-xs font-medium text-slate-500">更新日時</dt>
          <dd className="mt-0.5 text-sm text-slate-800">
            {formatDateTime(dataset.updatedAt)}
          </dd>
        </div>
      </dl>

      {/* アクション */}
      <div className="mt-6">
        <DatasetDetailActions
          id={dataset.id}
          status={dataset.status}
          isAdmin={user.role === "ADMIN"}
        />
      </div>

      {/* 外部データソース */}
      <div className="mt-8">
        <DataSourcePanel
          datasetId={dataset.id}
          initialConfig={sourceConfig}
          initialRuns={syncRuns}
        />
      </div>

      {/* プレビュー */}
      <div className="mt-8">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-900">
            データプレビュー
          </h2>
          {dataset.filePath && (
            <a
              href={`/api/datasets/${dataset.id}/download`}
              className="text-sm font-medium text-sky-700 hover:text-sky-800"
            >
              CSV をダウンロード
            </a>
          )}
        </div>
        <CsvPreviewTable
          columns={preview.columns}
          rows={preview.rows}
          totalRows={preview.totalRows}
          shown={preview.rows.length}
        />
      </div>

      {lineage && (
        <div className="mt-8">
          <LineagePanel lineage={lineage} linkBase="/dashboard/datasets" />
        </div>
      )}
    </div>
  );
}
