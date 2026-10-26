import Link from "next/link";
import { ROWS_PER_PAGE, type MatchedRow, type Page, type TableQuery } from "@/lib/table-search";

/**
 * データセットの全行の閲覧と検索(公開ページ・管理画面の両方で使う)。
 *
 * 検索とページ送りはサーバー側で行い、条件は URL のクエリに持つ。フォームは GET で送るので、
 * JavaScript が動かなくても使え、検索結果の URL をそのまま共有できる。
 */
export default function DataBrowser({
  columns,
  totalRows,
  query,
  page,
  basePath,
}: {
  columns: string[];
  /** 絞り込む前の全行数。 */
  totalRows: number;
  query: TableQuery;
  page: Page<MatchedRow>;
  /** このデータセットのページのパス(例: /catalog/xxx)。 */
  basePath: string;
}) {
  if (columns.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-8 text-center text-sm text-slate-500">
        表示できる CSV データがありません。
      </div>
    );
  }

  const colName = query.col === null ? "" : columns[query.col];
  /** 検索条件を保ったまま、指定したページへのリンクを作る。 */
  const pageHref = (n: number) => {
    const params = new URLSearchParams();
    if (query.q) params.set("q", query.q);
    if (colName) params.set("col", colName);
    if (n > 1) params.set("page", String(n));
    const s = params.toString();
    return `${basePath}${s ? `?${s}` : ""}#data`;
  };
  const from = page.total === 0 ? 0 : (page.page - 1) * ROWS_PER_PAGE + 1;
  const to = from === 0 ? 0 : from + page.items.length - 1;

  return (
    <div>
      {/* 検索フォーム(GET)。送信後もこの表の位置に戻るよう #data を付ける */}
      <form action={`${basePath}#data`} method="get" className="mb-3 flex flex-wrap items-center gap-2">
        <input
          type="search"
          name="q"
          defaultValue={query.q}
          placeholder="データを検索(スペース区切りで AND)"
          aria-label="データを検索"
          className="min-w-0 flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-100 sm:max-w-sm"
        />
        <select
          name="col"
          defaultValue={colName}
          aria-label="検索する列"
          className="rounded-md border border-slate-300 bg-white px-2 py-2 text-sm"
        >
          <option value="">すべての列</option>
          {columns.map((c, i) => (
            <option key={i} value={c}>
              {c || `列${i + 1}`}
            </option>
          ))}
        </select>
        <button
          type="submit"
          className="rounded-md bg-sky-600 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-700"
        >
          検索
        </button>
        {query.q && (
          <Link href={`${basePath}#data`} className="px-2 py-2 text-sm text-slate-500 hover:text-slate-800">
            条件をクリア
          </Link>
        )}
      </form>

      <p className="mb-2 text-xs text-slate-500">
        {query.q
          ? `全 ${totalRows.toLocaleString("ja-JP")} 行のうち ${page.total.toLocaleString("ja-JP")} 行が一致`
          : `全 ${totalRows.toLocaleString("ja-JP")} 行`}
        {page.total > 0 && ` · ${from.toLocaleString("ja-JP")}〜${to.toLocaleString("ja-JP")} 行目を表示`}
      </p>

      {page.total === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-8 text-center text-sm text-slate-500">
          条件に一致する行はありません。
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-slate-200">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-3 py-2 text-left text-xs font-semibold text-slate-400" title="元のデータでの行番号">
                  #
                </th>
                {columns.map((c, i) => (
                  <th
                    key={i}
                    className={`whitespace-nowrap px-3 py-2 text-left font-semibold ${
                      query.col === i ? "bg-sky-50 text-sky-800" : "text-slate-700"
                    }`}
                  >
                    {c || `列${i + 1}`}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {page.items.map(({ row, index }) => (
                <tr key={index} className="hover:bg-slate-50">
                  <td className="px-3 py-1.5 text-xs text-slate-400">{index + 1}</td>
                  {columns.map((_, ci) => {
                    const value = row[ci] ?? "";
                    // 長い値は省略し、マウスを乗せると全文が出るようにする
                    return (
                      <td
                        key={ci}
                        title={value.length > 40 ? value : undefined}
                        className="max-w-[24rem] truncate whitespace-nowrap px-3 py-1.5 text-slate-700"
                      >
                        {value}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {page.pageCount > 1 && (
        <nav aria-label="ページ送り" className="mt-3 flex flex-wrap items-center gap-1 text-sm">
          <PageLink href={pageHref(1)} disabled={page.page === 1} label="最初" />
          <PageLink href={pageHref(page.page - 1)} disabled={page.page === 1} label="← 前へ" />
          <span className="px-3 text-slate-600">
            {page.page.toLocaleString("ja-JP")} / {page.pageCount.toLocaleString("ja-JP")} ページ
          </span>
          <PageLink href={pageHref(page.page + 1)} disabled={page.page === page.pageCount} label="次へ →" />
          <PageLink href={pageHref(page.pageCount)} disabled={page.page === page.pageCount} label="最後" />
        </nav>
      )}
    </div>
  );
}

function PageLink({ href, disabled, label }: { href: string; disabled: boolean; label: string }) {
  if (disabled) {
    return <span className="rounded-md px-3 py-1.5 text-slate-300">{label}</span>;
  }
  return (
    <Link href={href} className="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-slate-700 hover:bg-slate-50">
      {label}
    </Link>
  );
}
