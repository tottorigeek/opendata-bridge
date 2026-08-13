/**
 * キー照合の指標計算(相性チェックとマージ統計の共通基盤)。
 *
 * マージ結果の行を組み立てずに、キーの突き合わせだけを行って
 * 両側のカバー率・キーの識別力・正規化の寄与・多重度などを算出する。
 * 出力行を作らないため行数爆発の危険がなく、何度でも実行できる。
 *
 * マージ実行時の統計もここを通す。相性チェックで見た数値とマージ後に
 * 記録される数値が同じ計算から出ることで、自動追従の品質ゲートが
 * 前回値と比較できる前提になる(docs/design/merge-design.md §2-4)。
 *
 * すべて純関数。副作用を持たない。
 */
import type { CsvTable } from "./csv";
import { normalizeValue, type NormalizationLevel } from "./normalize";

/** 片側のキー統計。 */
export interface SideKeyStats {
  totalRows: number;
  /** 正規化後のキーが空でない行数(マッチ対象になりうる行)。 */
  keyedRows: number;
  /** 正規化後のキーが空の行の割合(0〜1)。 */
  emptyKeyRate: number;
  /** 相異なる生キーの数(正規化前)。 */
  distinctRawKeys: number;
  /** 相異なる正規化キーの数。 */
  distinctKeys: number;
  /** キーの識別力 = distinctKeys / keyedRows。1 に近いほど行を一意に指す。 */
  discrimination: number;
  /**
   * 正規化による集約率 = 1 - distinctKeys / distinctRawKeys。
   * 表記ゆれが吸収されれば自然に上がるが、高すぎる場合は
   * 別物を同一視している(正規化のやりすぎ)を疑う。
   */
  collapseRate: number;
  /** 相手側とマッチした行数。 */
  matchedRows: number;
  /** カバー率 = matchedRows / totalRows。 */
  coverage: number;
}

/** マッチした行 1 件あたり、相手側に何行対応したか。 */
export interface Multiplicity {
  /** 最大値。1 行が何行に膨らみうるか。 */
  max: number;
  /** 平均値。 */
  mean: number;
  /** 1 対 1 で収まったマッチ行の割合(0〜1)。 */
  oneToOneRate: number;
}

export interface UnmatchedSample {
  side: "A" | "B";
  key: string;
  normalizedKey: string;
  row: Record<string, string>;
}

export interface KeyAnalysis {
  a: SideKeyStats;
  b: SideKeyStats;
  /** 両側に存在する正規化キーの数。 */
  sharedKeys: number;
  /** 正規化キーの和集合の大きさ。 */
  unionKeys: number;
  /** Jaccard 係数 = sharedKeys / unionKeys。方向を持たない重なりの指標。 */
  jaccard: number;
  /** A のマッチ行から見た多重度。 */
  multiplicity: Multiplicity;
  /** exact 比較での A 側カバー率。正規化の寄与を測る基準線。 */
  exactCoverageA: number;
  /** 正規化の寄与 = a.coverage - exactCoverageA。 */
  normalizationGain: number;
  /** 共通抽出型(INNER)で結合したときの出力行数。 */
  innerOutputRows: number;
  /** 項目拡張型(LEFT)で結合したときの出力行数。 */
  leftOutputRows: number;
  unmatchedSamples: UnmatchedSample[];
}

/** 正規化キー → 行数の索引。相性チェックの総当たりでは事前に作って使い回す。 */
export interface KeyIndex {
  counts: Map<string, number>;
  totalRows: number;
  keyedRows: number;
  distinctRawKeys: number;
}

function ratio(numerator: number, denominator: number): number {
  return denominator > 0 ? numerator / denominator : 0;
}

/** 指定列を指定レベルで正規化し、キー索引を作る。空キーの行は索引に入れない。 */
export function buildKeyIndex(
  table: CsvTable,
  column: string,
  level: NormalizationLevel,
): KeyIndex {
  const counts = new Map<string, number>();
  const rawKeys = new Set<string>();
  let keyedRows = 0;

  for (const row of table.rows) {
    const raw = row[column] ?? "";
    const key = normalizeValue(raw, level);
    if (key === "") continue;
    keyedRows += 1;
    rawKeys.add(raw);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  return {
    counts,
    totalRows: table.rows.length,
    keyedRows,
    distinctRawKeys: rawKeys.size,
  };
}

function sideStats(index: KeyIndex, matchedRows: number): SideKeyStats {
  return {
    totalRows: index.totalRows,
    keyedRows: index.keyedRows,
    emptyKeyRate: ratio(index.totalRows - index.keyedRows, index.totalRows),
    distinctRawKeys: index.distinctRawKeys,
    distinctKeys: index.counts.size,
    discrimination: ratio(index.counts.size, index.keyedRows),
    collapseRate:
      index.distinctRawKeys > 0
        ? 1 - index.counts.size / index.distinctRawKeys
        : 0,
    matchedRows,
    coverage: ratio(matchedRows, index.totalRows),
  };
}

/** 索引同士を突き合わせて数値指標を出す(サンプル行は含まない)。 */
export function compareKeyIndexes(
  indexA: KeyIndex,
  indexB: KeyIndex,
): Omit<KeyAnalysis, "exactCoverageA" | "normalizationGain" | "unmatchedSamples"> {
  // 走査は小さい側から行う(和集合の計算量を抑える)。
  const [small, large] =
    indexA.counts.size <= indexB.counts.size
      ? [indexA.counts, indexB.counts]
      : [indexB.counts, indexA.counts];

  let sharedKeys = 0;
  let matchedRowsA = 0;
  let matchedRowsB = 0;
  let innerOutputRows = 0;
  let maxMultiplicity = 0;
  let oneToOneRows = 0;

  for (const [key, countSmall] of small) {
    const countLarge = large.get(key);
    if (countLarge === undefined) continue;

    sharedKeys += 1;
    const countA = small === indexA.counts ? countSmall : countLarge;
    const countB = small === indexA.counts ? countLarge : countSmall;

    matchedRowsA += countA;
    matchedRowsB += countB;
    innerOutputRows += countA * countB;
    if (countB > maxMultiplicity) maxMultiplicity = countB;
    if (countB === 1) oneToOneRows += countA;
  }

  const unionKeys = indexA.counts.size + indexB.counts.size - sharedKeys;

  return {
    a: sideStats(indexA, matchedRowsA),
    b: sideStats(indexB, matchedRowsB),
    sharedKeys,
    unionKeys,
    jaccard: ratio(sharedKeys, unionKeys),
    multiplicity: {
      max: maxMultiplicity,
      mean: ratio(innerOutputRows, matchedRowsA),
      oneToOneRate: ratio(oneToOneRows, matchedRowsA),
    },
    innerOutputRows,
    // 左外部結合では、マッチしなかった A の行(空キー行を含む)が 1 行ずつ残る。
    leftOutputRows: innerOutputRows + (indexA.totalRows - matchedRowsA),
  };
}

/** マッチしなかった行を先頭から拾う(両側あわせて limit 件まで)。 */
function collectUnmatchedSamples(
  a: CsvTable,
  b: CsvTable,
  keyA: string,
  keyB: string,
  level: NormalizationLevel,
  indexA: KeyIndex,
  indexB: KeyIndex,
  limit: number,
): UnmatchedSample[] {
  const samples: UnmatchedSample[] = [];
  const perSide = Math.max(1, Math.floor(limit / 2));

  const collect = (
    table: CsvTable,
    column: string,
    side: "A" | "B",
    otherCounts: Map<string, number>,
  ) => {
    let taken = 0;
    for (const row of table.rows) {
      if (taken >= perSide) break;
      const raw = row[column] ?? "";
      const key = normalizeValue(raw, level);
      if (key !== "" && otherCounts.has(key)) continue;
      samples.push({ side, key: raw, normalizedKey: key, row });
      taken += 1;
    }
  };

  collect(a, keyA, "A", indexB.counts);
  collect(b, keyB, "B", indexA.counts);
  return samples;
}

export interface AnalyzeOptions {
  /** アンマッチ例の最大件数(両側あわせて)。既定 10。 */
  unmatchedSampleLimit?: number;
  /** false にすると exact 比較を省く(正規化の寄与は 0 になる)。既定 true。 */
  includeNormalizationGain?: boolean;
}

/**
 * 2 つのテーブルを指定キー・指定レベルで突き合わせ、指標一式を算出する。
 * 出力行は組み立てないため、行数に対して線形の計算量で収まる。
 */
export function analyzeKeys(
  a: CsvTable,
  b: CsvTable,
  keyA: string,
  keyB: string,
  level: NormalizationLevel,
  options: AnalyzeOptions = {},
): KeyAnalysis {
  const { unmatchedSampleLimit = 10, includeNormalizationGain = true } = options;

  const indexA = buildKeyIndex(a, keyA, level);
  const indexB = buildKeyIndex(b, keyB, level);
  const compared = compareKeyIndexes(indexA, indexB);

  // 正規化の寄与: 同じキー列を exact で突き合わせた場合との差。
  // level が exact のときは差が定義上 0 なので計算を省く。
  let exactCoverageA = compared.a.coverage;
  if (includeNormalizationGain && level !== "exact") {
    const exactA = buildKeyIndex(a, keyA, "exact");
    const exactB = buildKeyIndex(b, keyB, "exact");
    exactCoverageA = compareKeyIndexes(exactA, exactB).a.coverage;
  }

  return {
    ...compared,
    exactCoverageA,
    normalizationGain: compared.a.coverage - exactCoverageA,
    unmatchedSamples: collectUnmatchedSamples(
      a,
      b,
      keyA,
      keyB,
      level,
      indexA,
      indexB,
      unmatchedSampleLimit,
    ),
  };
}
