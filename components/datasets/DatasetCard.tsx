import Link from "next/link";
import {
  parseTags,
  orgTypeBadge,
  effectiveRegion,
  formatRegion,
  VISIBILITY_LABEL,
} from "@/lib/datasets";

export interface DatasetCardItem {
  id: string;
  title: string;
  description: string;
  tags: string;
  visibility: string;
  rowCount: number;
  updatedAt: Date;
  prefecture: string | null;
  municipality: string | null;
  organization: {
    id: string;
    name: string;
    type: string;
    verified: boolean;
    prefecture: string | null;
    municipality: string | null;
  };
}

function formatDate(d: Date): string {
  return new Intl.DateTimeFormat("ja-JP", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

/**
 * カタログと組織ページで共通のデータセットカード。
 *
 * 組織ページでは提供組織が自明なので、showOrganization=false で組織名を省く。
 */
export default function DatasetCard({
  dataset,
  showOrganization = true,
}: {
  dataset: DatasetCardItem;
  showOrganization?: boolean;
}) {
  const tags = parseTags(dataset.tags);
  const region = formatRegion(effectiveRegion(dataset));
  const badge = orgTypeBadge(dataset.organization.type, dataset.organization.verified);

  return (
    <Link
      href={`/catalog/${dataset.id}`}
      className="flex flex-col rounded-xl border border-slate-200 bg-white p-5 transition hover:border-sky-300 hover:shadow-sm"
    >
      <div className="flex items-center gap-2">
        <span
          title={badge.title}
          className={`rounded-full px-2 py-0.5 text-xs font-medium ${badge.className}`}
        >
          {badge.label}
        </span>
        {dataset.visibility === "ORG_ONLY" && (
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500">
            {VISIBILITY_LABEL[dataset.visibility]}
          </span>
        )}
      </div>
      <h2 className="mt-2 font-semibold text-slate-900">{dataset.title}</h2>
      <p className="mt-1 line-clamp-2 flex-1 text-sm text-slate-600">
        {dataset.description || "（説明なし）"}
      </p>
      <div className="mt-3 flex flex-wrap gap-1">
        {region && (
          <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">
            {region}
          </span>
        )}
        {tags.slice(0, 3).map((t) => (
          <span
            key={t}
            className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500"
          >
            {t}
          </span>
        ))}
      </div>
      <div className="mt-3 flex items-center justify-between text-xs text-slate-400">
        <span>{showOrganization ? dataset.organization.name : ""}</span>
        <span>
          {dataset.rowCount.toLocaleString("ja-JP")} 行 · {formatDate(dataset.updatedAt)}
        </span>
      </div>
    </Link>
  );
}
