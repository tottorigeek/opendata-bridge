import fs from "node:fs";
const src = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));

// 政令指定都市の行政区(city に空白を含む "札幌市 中央区" 形式)は除外し、
// 市区町村レベル 1,741 件に揃える。
const rows = src
  .filter((r) => !r.city.includes(" "))
  .map((r) => ({ pref: r.pref, name: r.city, code: r.lgcode }))
  .sort((a, b) => a.code.localeCompare(b.code));

const prefs = [];
for (const r of rows) if (!prefs.includes(r.pref)) prefs.push(r.pref);

if (prefs.length !== 47) throw new Error(`prefecture count = ${prefs.length}`);
if (rows.length !== 1741) throw new Error(`municipality count = ${rows.length}`);

const header = `// このファイルは自動生成です(scripts/generate-regions.mjs)。手で編集しないでください。
//
// 出典: 総務省「全国地方公共団体コード」
//   https://www.soumu.go.jp/denshijiti/code.html
//   政府標準利用規約に基づき、都道府県名・市区町村名・団体コードの事実データのみを収録しています。
//   取得の便宜上 code4fukui/localgovjp (https://github.com/code4fukui/localgovjp) の
//   再配布データを経由していますが、当該データ固有の項目(座標・URL 等)は含みません。
//
// 収録範囲: 47 都道府県 / 1,741 市区町村(政令指定都市の行政区は含まない)

/** 都道府県名(全国地方公共団体コード順)。 */
export const PREFECTURES: readonly string[] = ${JSON.stringify(prefs, null, 2)};

/** 市区町村マスタの 1 件。 */
export interface Municipality {
  /** 所属する都道府県名(PREFECTURES のいずれか)。 */
  pref: string;
  /** 市区町村名。同一都道府県内で一意。 */
  name: string;
  /** 全国地方公共団体コード(6 桁・検査数字込み)。 */
  code: string;
}

/** 全 1,741 市区町村(全国地方公共団体コード順)。 */
export const MUNICIPALITIES: readonly Municipality[] = ${JSON.stringify(rows, null, 2)};

// ---------------------------------------------------------------------------
// 参照ヘルパー
// ---------------------------------------------------------------------------

/** 都道府県名 → その県の市区町村名(コード順)。初回参照時に一度だけ構築する。 */
let byPrefecture: Map<string, string[]> | null = null;

function index(): Map<string, string[]> {
  if (!byPrefecture) {
    const map = new Map<string, string[]>();
    for (const m of MUNICIPALITIES) {
      const list = map.get(m.pref);
      if (list) list.push(m.name);
      else map.set(m.pref, [m.name]);
    }
    byPrefecture = map;
  }
  return byPrefecture;
}

/** 都道府県名として妥当か。 */
export function isValidPrefecture(value: string): boolean {
  return index().has(value);
}

/** 指定した都道府県に属する市区町村名の一覧(コード順)。未知の県名なら空配列。 */
export function municipalitiesOf(pref: string): readonly string[] {
  return index().get(pref) ?? [];
}

/** 全都道府県を [県名, 市区町村名の配列] の形で列挙する(コード順)。 */
export function allPrefectureGroups(): { pref: string; names: readonly string[] }[] {
  return PREFECTURES.map((pref) => ({ pref, names: municipalitiesOf(pref) }));
}

/**
 * 市区町村名として妥当か。
 * pref を渡した場合はその都道府県に属することも検査する。
 */
export function isValidMunicipality(name: string, pref?: string): boolean {
  if (pref !== undefined) return municipalitiesOf(pref).includes(name);
  return MUNICIPALITIES.some((m) => m.name === name);
}

/** 市区町村名から所属都道府県を引く(同名が複数県にある場合は最初の 1 件)。 */
export function prefectureOf(municipality: string): string | undefined {
  return MUNICIPALITIES.find((m) => m.name === municipality)?.pref;
}
`;

fs.writeFileSync(process.argv[3], header);
console.log(`prefectures: ${prefs.length}, municipalities: ${rows.length}`);
