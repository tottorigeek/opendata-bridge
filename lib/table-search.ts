/**
 * データセットの表の検索とページ送り(純関数)。
 *
 * 検索条件は URL のクエリ(?q=&col=&page=)で受け取り、サーバー側で絞り込む。
 * 数万行の表でもブラウザに全行を送らずに済み、検索結果の URL をそのまま共有できる。
 */

export const ROWS_PER_PAGE = 50;

export type TableQuery = {
  /** 検索語(空なら絞り込まない)。スペース区切りの語はすべて含む行だけに絞る。 */
  q: string;
  /** 検索対象の列の位置。null ならすべての列。 */
  col: number | null;
  /** 1 始まりのページ番号。 */
  page: number;
};

type RawQuery = { q?: string | string[]; col?: string | string[]; page?: string | string[] };

function first(value: string | string[] | undefined): string {
  return (Array.isArray(value) ? value[0] : value) ?? "";
}

/** URL のクエリを検索条件にする。列名が表に無ければ「すべての列」とみなす。 */
export function parseTableQuery(raw: RawQuery, columns: string[]): TableQuery {
  const q = first(raw.q).trim().slice(0, 200);
  const colName = first(raw.col);
  const colIndex = colName ? columns.indexOf(colName) : -1;
  const page = Number.parseInt(first(raw.page), 10);
  return {
    q,
    col: colIndex >= 0 ? colIndex : null,
    page: Number.isInteger(page) && page >= 1 ? page : 1,
  };
}

/**
 * 比較用に文字列をそろえる。全角・半角(NFKC)、大文字・小文字、
 * カタカナ・ひらがな(「トットリ」と「とっとり」)の違いを無くす。
 */
export function normalizeForSearch(text: string): string {
  return text
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[ァ-ヶ]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0x60));
}

export type MatchedRow = { row: string[]; /** 元の表での 0 始まりの行位置 */ index: number };

/** 検索語で行を絞り込む。検索語が空なら全行を返す。 */
export function filterRows(rows: string[][], query: Pick<TableQuery, "q" | "col">): MatchedRow[] {
  const terms = normalizeForSearch(query.q).split(/\s+/).filter(Boolean);
  const all = rows.map((row, index) => ({ row, index }));
  if (terms.length === 0) return all;
  return all.filter(({ row }) => {
    const haystack =
      query.col === null
        ? normalizeForSearch(row.join("\u0000"))
        : normalizeForSearch(row[query.col] ?? "");
    return terms.every((t) => haystack.includes(t));
  });
}

export type Page<T> = { items: T[]; page: number; pageCount: number; total: number };

/** ページ送り。範囲外のページ番号は最後のページに丸める。 */
export function paginate<T>(items: T[], page: number, perPage = ROWS_PER_PAGE): Page<T> {
  const pageCount = Math.max(1, Math.ceil(items.length / perPage));
  const current = Math.min(Math.max(1, page), pageCount);
  return {
    items: items.slice((current - 1) * perPage, current * perPage),
    page: current,
    pageCount,
    total: items.length,
  };
}
