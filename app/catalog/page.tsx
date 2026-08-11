import Link from "next/link";
import SiteHeader from "@/components/SiteHeader";
import RegionFilter from "@/components/catalog/RegionFilter";
import { getCurrentUser } from "@/lib/auth";
import {
  listCatalogDatasets,
  collectCatalogTags,
  parseTags,
  orgTypeBadge,
  effectiveRegion,
  formatRegion,
  VISIBILITY_LABEL,
} from "@/lib/datasets";
import {
  PREFECTURES,
  allPrefectureGroups,
  isValidMunicipality,
  isValidPrefecture,
  municipalitiesOf,
} from "@/lib/regions";

export const dynamic = "force-dynamic";

function formatDate(d: Date): string {
  return new Intl.DateTimeFormat("ja-JP", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

export default async function CatalogPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    type?: string;
    tag?: string;
    pref?: string;
    city?: string;
  }>;
}) {
  const user = await getCurrentUser();
  const sp = await searchParams;

  const keyword = sp.q?.trim() || "";
  const orgType =
    sp.type === "GOVERNMENT" || sp.type === "PRIVATE" ? sp.type : undefined;
  const tag = sp.tag?.trim() || "";

  // 地域はマスタに存在する値だけを採用する(不正値は未指定として扱う)。
  const prefInput = sp.pref?.trim() || "";
  const prefecture = isValidPrefecture(prefInput) ? prefInput : "";
  const cityInput = sp.city?.trim() || "";
  const municipality = isValidMunicipality(
    cityInput,
    prefecture || undefined,
  )
    ? cityInput
    : "";

  // 都道府県が選ばれていればその県の市区町村だけ、未選択なら全県を optgroup で出す。
  const municipalityGroups = prefecture
    ? [{ pref: prefecture, names: municipalitiesOf(prefecture) }]
    : allPrefectureGroups();

  const [datasets, allTags] = await Promise.all([
    listCatalogDatasets(user, {
      keyword,
      orgType,
      tag: tag || undefined,
      prefecture: prefecture || undefined,
      municipality: municipality || undefined,
    }),
    collectCatalogTags(user),
  ]);

  const inputClass =
    "w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-100";

  return (
    <>
      <SiteHeader />
      <main className="flex-1">
        <div className="mx-auto max-w-6xl px-4 py-12">
          <h1 className="text-2xl font-bold text-slate-900">公開データカタログ</h1>
          <p className="mt-2 text-slate-600">
            行政・民間が公開したオープンデータを横断的に検索・閲覧できます。
            {!user && "（ログインすると所属組織限定の公開データも表示されます。）"}
          </p>

          {/* 検索・フィルタ(GET フォーム) */}
          <form
            method="get"
            className="mt-8 flex flex-wrap items-end gap-3 rounded-xl border border-slate-200 bg-white p-4"
          >
            <div className="min-w-[220px] flex-1">
              <label className="mb-1 block text-xs font-medium text-slate-600">
                キーワード
              </label>
              <input
                name="q"
                defaultValue={keyword}
                placeholder="タイトル・説明・タグで検索"
                className={inputClass}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">
                組織種別
              </label>
              <select name="type" defaultValue={orgType ?? ""} className={inputClass}>
                <option value="">すべて</option>
                <option value="GOVERNMENT">行政</option>
                <option value="PRIVATE">民間</option>
              </select>
            </div>
            <RegionFilter
              prefectures={PREFECTURES}
              prefecture={prefecture}
              municipality={municipality}
              groups={municipalityGroups}
              selectClassName={inputClass}
              labelClassName="mb-1 block text-xs font-medium text-slate-600"
            />
            {tag && <input type="hidden" name="tag" value={tag} />}
            <div className="flex gap-2">
              <button
                type="submit"
                className="rounded-md bg-sky-600 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-700"
              >
                検索
              </button>
              {(keyword || orgType || tag || prefecture || municipality) && (
                <Link
                  href="/catalog"
                  className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
                >
                  クリア
                </Link>
              )}
            </div>
          </form>

          {/* タグフィルタ */}
          {allTags.length > 0 && (
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <span className="text-xs font-medium text-slate-500">タグ:</span>
              {allTags.slice(0, 20).map((t) => {
                const active = t === tag;
                const qs = new URLSearchParams();
                if (keyword) qs.set("q", keyword);
                if (orgType) qs.set("type", orgType);
                if (prefecture) qs.set("pref", prefecture);
                if (municipality) qs.set("city", municipality);
                if (!active) qs.set("tag", t);
                const href = `/catalog${qs.toString() ? `?${qs}` : ""}`;
                return (
                  <Link
                    key={t}
                    href={href}
                    className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
                      active
                        ? "bg-sky-600 text-white"
                        : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                    }`}
                  >
                    {t}
                  </Link>
                );
              })}
            </div>
          )}

          {/* 結果 */}
          <p className="mt-6 text-sm text-slate-500">
            {datasets.length.toLocaleString("ja-JP")} 件のデータセット
          </p>

          {datasets.length === 0 ? (
            <div className="mt-4 rounded-xl border border-dashed border-slate-300 bg-white p-12 text-center">
              <p className="text-slate-600">
                条件に一致する公開データセットが見つかりませんでした。
              </p>
              <p className="mt-1 text-sm text-slate-500">
                キーワードやフィルタを変更してお試しください。
              </p>
            </div>
          ) : (
            <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {datasets.map((d) => {
                const tags = parseTags(d.tags);
                const region = formatRegion(effectiveRegion(d));
                return (
                  <Link
                    key={d.id}
                    href={`/catalog/${d.id}`}
                    className="flex flex-col rounded-xl border border-slate-200 bg-white p-5 transition hover:border-sky-300 hover:shadow-sm"
                  >
                    <div className="flex items-center gap-2">
                      {(() => {
                        const badge = orgTypeBadge(
                          d.organization.type,
                          d.organization.verified,
                        );
                        return (
                          <span
                            title={badge.title}
                            className={`rounded-full px-2 py-0.5 text-xs font-medium ${badge.className}`}
                          >
                            {badge.label}
                          </span>
                        );
                      })()}
                      {d.visibility === "ORG_ONLY" && (
                        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500">
                          {VISIBILITY_LABEL[d.visibility]}
                        </span>
                      )}
                    </div>
                    <h2 className="mt-2 font-semibold text-slate-900">{d.title}</h2>
                    <p className="mt-1 line-clamp-2 flex-1 text-sm text-slate-600">
                      {d.description || "（説明なし）"}
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
                      <span>{d.organization.name}</span>
                      <span>
                        {d.rowCount.toLocaleString("ja-JP")} 行 · {formatDate(d.updatedAt)}
                      </span>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      </main>
    </>
  );
}
