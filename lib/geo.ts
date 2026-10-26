/**
 * 緯度・経度の列を持つデータセットを地図に載せるための変換。
 *
 * データセットは任意の CSV なので、座標の列は列名から推定する。対応するのは
 * 「緯度 / 経度」(政府標準の推奨データセットの表記)と「latitude / longitude」系だけで、
 * x / y のような曖昧な列名は推定しない(平面直角座標の X / Y を緯度経度と取り違えるため)。
 *
 * 本モジュールは純関数のみ。サーバー(ページ・GeoJSON 配信)とテストから使う。
 */

export type CoordinateColumns = { lat: number; lng: number };

/** 地図に載せる 1 地点。props は座標以外の列の [列名, 値]。 */
export type MapPoint = {
  lat: number;
  lng: number;
  props: [string, string][];
  /** 元の表での 0 始まりの行位置(検索で絞り込んだ行だけを地図に出すのに使う)。 */
  row: number;
};

export type MapPoints = {
  points: MapPoint[];
  /** 座標が空・数値でない・範囲外で載せられなかった行数。 */
  skipped: number;
  /** 上限を超えたため載せなかった行数。 */
  truncated: number;
};

/** 地図に一度に描く点の上限。これを超えるとブラウザが重くなる。 */
export const MAX_MAP_POINTS = 5000;

const LAT_NAMES = ["緯度", "latitude", "lat"];
const LNG_NAMES = ["経度", "longitude", "lng", "lon", "long"];

function normalizeName(name: string): string {
  return name.normalize("NFKC").trim().toLowerCase().replace(/[\s_-]+/g, "");
}

/**
 * 緯度・経度の列の位置を返す。両方そろわなければ null。
 * 同じ種類の候補が複数あるときは、先に現れた列を使う。
 */
export function detectCoordinateColumns(columns: string[]): CoordinateColumns | null {
  const names = columns.map(normalizeName);
  const lat = names.findIndex((n) => LAT_NAMES.includes(n));
  const lng = names.findIndex((n) => LNG_NAMES.includes(n));
  if (lat < 0 || lng < 0 || lat === lng) return null;
  return { lat, lng };
}

/** セルの値を座標として読む。空・数値以外・範囲外は null。 */
function parseCoordinate(value: string | undefined, limit: number): number | null {
  if (value === undefined) return null;
  const text = value.normalize("NFKC").trim();
  if (text === "") return null;
  // "35.5" や "-1.25e1" だけを数値とみなす。"35度30分" などは読まない
  if (!/^[+-]?(\d+(\.\d*)?|\.\d+)(e[+-]?\d+)?$/i.test(text)) return null;
  const n = Number(text);
  if (!Number.isFinite(n) || Math.abs(n) > limit) return null;
  return n;
}

/** 1 行の座標。読めなければ null。緯度経度とも 0 の行は未入力の埋め値とみなす。 */
function rowCoordinate(row: string[], cols: CoordinateColumns): { lat: number; lng: number } | null {
  const lat = parseCoordinate(row[cols.lat], 90);
  const lng = parseCoordinate(row[cols.lng], 180);
  if (lat === null || lng === null) return null;
  if (lat === 0 && lng === 0) return null;
  return { lat, lng };
}

/**
 * 全行で同じ値の列の位置。地点ごとの違いを表さないので、ポップアップには出さない
 * (例: すべて「鳥取市」の地方公共団体名)。2 行未満のときは判定しない。
 */
function constantColumns(columns: string[], rows: string[][]): Set<number> {
  const result = new Set<number>();
  if (rows.length < 2) return result;
  columns.forEach((_, i) => {
    const first = (rows[0][i] ?? "").trim();
    if (rows.every((r) => (r[i] ?? "").trim() === first)) result.add(i);
  });
  return result;
}

/** CSV の行を地図用の点にする。 */
export function toMapPoints(
  columns: string[],
  rows: string[][],
  cols: CoordinateColumns,
  max = MAX_MAP_POINTS,
): MapPoints {
  const points: MapPoint[] = [];
  let skipped = 0;
  let truncated = 0;
  const constant = constantColumns(columns, rows);
  rows.forEach((row, rowIndex) => {
    const coord = rowCoordinate(row, cols);
    if (!coord) {
      skipped++;
      return;
    }
    if (points.length >= max) {
      truncated++;
      return;
    }
    const props: [string, string][] = [];
    columns.forEach((name, i) => {
      if (i === cols.lat || i === cols.lng || constant.has(i)) return;
      const v = (row[i] ?? "").trim();
      if (v !== "") props.push([name, v]);
    });
    points.push({ ...coord, props, row: rowIndex });
  });
  return { points, skipped, truncated };
}

/**
 * CSV の行を GeoJSON(FeatureCollection / Point)にする。
 * 座標以外の列は properties に文字列のまま入れる(型の推定はしない。
 * "0123" のような番号を数値にすると先頭の 0 が消えるため)。
 * 座標の読めない行は含めない。
 */
export function toGeoJson(columns: string[], rows: string[][], cols: CoordinateColumns) {
  const features = [];
  for (const row of rows) {
    const coord = rowCoordinate(row, cols);
    if (!coord) continue;
    const properties: Record<string, string> = {};
    columns.forEach((name, i) => {
      if (i === cols.lat || i === cols.lng) return;
      properties[name] = (row[i] ?? "").trim();
    });
    features.push({
      type: "Feature" as const,
      geometry: { type: "Point" as const, coordinates: [coord.lng, coord.lat] },
      properties,
    });
  }
  return { type: "FeatureCollection" as const, features };
}

/** 地図の表示範囲(南西と北東の角)。 */
export type CoordinateBounds = [[number, number], [number, number]];

/**
 * 最初に表示する範囲を、点が集まっている部分に合わせて求める。
 *
 * 全点の外接矩形に合わせると、遠く離れた数件(県外の会場など)のせいで地図が引きすぎ、
 * 大半の点が 1 つのクラスターに潰れてしまう。そこで点が多いときは、緯度・経度それぞれ
 * 両端の 2% を外した範囲にする。外した点も地図を動かせば見える。
 * 点が少ないとき(20 件未満)は全点を含める(外れ値と本体の区別がつかないため)。
 */
export function coreBounds(points: { lat: number; lng: number }[]): CoordinateBounds | null {
  if (points.length === 0) return null;
  const lats = points.map((p) => p.lat).sort((a, b) => a - b);
  const lngs = points.map((p) => p.lng).sort((a, b) => a - b);
  const trim = points.length >= 20 ? Math.floor(points.length * 0.02) : 0;
  const lo = trim;
  const hi = points.length - 1 - trim;
  return [
    [lats[lo], lngs[lo]],
    [lats[hi], lngs[hi]],
  ];
}
