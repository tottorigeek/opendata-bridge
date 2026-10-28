/**
 * 地図のクラスターの色。件数が多いほど赤に近づける。
 *
 * 色の段階: 青(少)→ 紫 → 赤紫 → 赤(多)。青から黄を経由すると途中がくすんだ緑になり
 * 地図の上で見分けにくいため、紫の側を回す。比べる基準は「いま見えているクラスターの最大件数」で、
 * 拡大・移動するたびに変わる(どの縮尺でも、見えている中で最も多いものが赤になる)。
 * 件数は 2 件から数千件まで桁がばらつくので、対数で比べる。そうしないと最大以外が
 * ほぼすべて青になり、色の違いが読み取れない。
 */

type Rgb = [number, number, number];

/** 色の段階(sky-600 → violet-600 → pink-600 → red-600)。 */
const STOPS: Rgb[] = [
  [2, 132, 199],
  [124, 58, 237],
  [219, 39, 119],
  [220, 38, 38],
];

/** 0〜1 の比率を色にする。 */
export function rampColor(ratio: number): string {
  const r = Math.min(1, Math.max(0, Number.isFinite(ratio) ? ratio : 0));
  const scaled = r * (STOPS.length - 1);
  const i = Math.min(STOPS.length - 2, Math.floor(scaled));
  const t = scaled - i;
  const [a, b] = [STOPS[i], STOPS[i + 1]];
  const mix = (k: number) => Math.round(a[k] + (b[k] - a[k]) * t);
  return `rgb(${mix(0)}, ${mix(1)}, ${mix(2)})`;
}

/** 見えている最大件数がこれ以上なら、最大のクラスターを真っ赤にする。 */
const FULL_RED_AT = 100;

/**
 * クラスターの件数と、見えているクラスターの最大件数から色を決める。
 *
 * 見えている中での相対値で色を付けるが、最大でも数件しかないとき(大きく拡大したとき)に
 * それが真っ赤になると「多い」と誤解されるので、最大件数が FULL_RED_AT に満たないうちは
 * 赤まで振り切らない。
 */
export function clusterColor(count: number, maxVisible: number): string {
  // クラスターは 2 件以上なので、2 件を起点(青)にする
  if (maxVisible <= 2 || count <= 2) return rampColor(0);
  const relative = Math.log(count / 2) / Math.log(maxVisible / 2);
  const scale = Math.min(1, Math.log(maxVisible / 2) / Math.log(FULL_RED_AT / 2));
  return rampColor(relative * scale);
}

/** 凡例に使う CSS のグラデーション。 */
export const CLUSTER_LEGEND_GRADIENT = `linear-gradient(to right, ${STOPS.map((c) => `rgb(${c.join(", ")})`).join(", ")})`;
