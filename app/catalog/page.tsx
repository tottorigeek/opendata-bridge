import Link from "next/link";
import SiteHeader from "@/components/SiteHeader";
import RegionFilter from "@/components/catalog/RegionFilter";
import DatasetCard from "@/components/datasets/DatasetCard";
import { getCurrentUser } from "@/lib/auth";
import { listCatalogDatasets, collectCatalogTags } from "@/lib/datasets";
import { getOrganization } from "@/lib/organizations";
import {
  PREFECTURES,
  allPrefectureGroups,
  isValidMunicipality,
  isValidPrefecture,
  municipalitiesOf,
} from "@/lib/regions";

export const dynamic = "force-dynamic";

export default async function CatalogPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    type?: string;
    tag?: string;
    pref?: string;
    city?: string;
    org?: string;
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

  // 組織での絞り込み。存在しない ID は未指定として扱う。
  const orgId = sp.org?.trim() || "";
  const organization = orgId ? await getOrganization(orgId) : null;

  const [datasets, allTags] = await Promise.all([
    listCatalogDatasets(user, {
      keyword,
      orgType,
      tag: tag || undefined,
      prefecture: prefecture || undefined,
      municipality: municipality || undefined,
      organizationId: organization?.id,
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

          {organization && (
            <div className="mt-4 flex flex-wrap items-center gap-3 rounded-lg border border-sky-200 bg-sky-50 px-4 py-3 text-sm">
              <span className="text-sky-900">
                <Link
                  href={`/organizations/${organization.id}`}
                  className="font-semibold hover:underline"
                >
                  {organization.name}
                </Link>
                {" のデータに絞り込んでいます。"}
              </span>
              <Link
                href="/catalog"
                className="text-xs font-medium text-sky-700 hover:underline"
              >
                絞り込みを解除
              </Link>
            </div>
          )}

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
            {organization && (
              <input type="hidden" name="org" value={organization.id} />
            )}
            <div className="flex gap-2">
              <button
                type="submit"
                className="rounded-md bg-sky-600 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-700"
              >
                検索
              </button>
              {(keyword || orgType || tag || prefecture || municipality || organization) && (
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
                if (organization) qs.set("org", organization.id);
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
              {datasets.map((d) => (
                <DatasetCard key={d.id} dataset={d} />
              ))}
            </div>
          )}
        </div>
      </main>
    </>
  );
}
