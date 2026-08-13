/**
 * 相性チェック — マージ前に 2 つのデータセットの噛み合い具合を診断する。
 *
 * マージ結果を作らずにキーの突き合わせだけを行うため安価で、
 * 行数爆発の危険もない。同じ計算(lib/merge/metrics.ts)をマージ実行時の
 * 統計にも使うので、ここで見た数値とマージ後に記録される数値は一致する。
 *
 * 設計の背景は docs/design/merge-design.md §2-4 を参照。
 */
import type { CsvTable } from "./csv";
import type { MergeKind } from "./engine";
import { DEFAULT_MAX_OUTPUT_ROWS } from "./engine";
import { analyzeKeys, buildKeyIndex, compareKeyIndexes, type KeyAnalysis } from "./metrics";
import type { NormalizationLevel } from "./normalize";

export type WarningSeverity = "info" | "warn" | "error";

export interface AffinityWarning {
  severity: WarningSeverity;
  /** 利用者に見せる文言。 */
  message: string;
}

export interface AffinityReport {
  keyA: string;
  keyB: string;
  level: NormalizationLevel;
  kind: MergeKind;
  analysis: KeyAnalysis;
  /** この設定でマージした場合の推定出力行数。 */
  estimatedOutputRows: number;
  warnings: AffinityWarning[];
}

/** キーの識別力がこれを下回ると、キー列として機能していないとみなす。 */
const LOW_DISCRIMINATION = 0.1;
/** 正規化でこれ以上まとまると、別物の同一視を疑う。 */
const HIGH_COLLAPSE_RATE = 0.5;
/** 空キーがこの割合を超えると警告する。 */
const HIGH_EMPTY_KEY_RATE = 0.3;
/** マッチ 1 件あたりの平均対応数がこれを超えると、キー選択を疑う。 */
const HIGH_MEAN_MULTIPLICITY = 5;
/** カバー率がこれを下回ると、結合する価値が薄いとみなす。 */
const LOW_COVERAGE = 0.05;

/**
 * 診断結果から警告を組み立てる。
 *
 * 同じ数値でもマージ型によって意味が変わる点に注意する
 * (docs/design/merge-design.md §1-3)。項目拡張型では参照側 B が
 * 基準側 A より大きいのが通常であり、**B 側カバー率が低いことは正常**である。
 * ここで警告を出すと、利用者は直す必要のないものを直そうとする。
 */
function buildWarnings(
  analysis: KeyAnalysis,
  kind: MergeKind,
  estimatedOutputRows: number,
  maxOutputRows: number,
): AffinityWarning[] {
  const warnings: AffinityWarning[] = [];
  const pct = (v: number) => `${(v * 100).toFixed(1)}%`;

  if (estimatedOutputRows > maxOutputRows) {
    warnings.push({
      severity: "error",
      message:
        `この設定では出力が約 ${estimatedOutputRows.toLocaleString("ja-JP")} 行になり、` +
        `上限(${maxOutputRows.toLocaleString("ja-JP")} 行)を超えます。` +
        `キー列の値が重複しすぎている可能性があります。`,
    });
  }

  // A 側カバー率はどちらの型でも主指標。
  if (analysis.a.coverage < LOW_COVERAGE) {
    warnings.push({
      severity: "warn",
      message: `A 側のカバー率が ${pct(analysis.a.coverage)} しかありません。キー列の選択を見直してください。`,
    });
  }

  // B 側カバー率は共通抽出型でのみ異常のサインになる。
  if (kind === "intersect" && analysis.b.coverage < LOW_COVERAGE) {
    warnings.push({
      severity: "warn",
      message: `B 側のカバー率が ${pct(analysis.b.coverage)} しかありません。2 つのデータが同じ対象を指していない可能性があります。`,
    });
  }

  for (const [side, stats] of [
    ["A", analysis.a],
    ["B", analysis.b],
  ] as const) {
    if (stats.keyedRows > 0 && stats.discrimination < LOW_DISCRIMINATION) {
      warnings.push({
        severity: "warn",
        message:
          `${side} 側のキーの識別力が低いです(${stats.keyedRows.toLocaleString("ja-JP")} 行に対し` +
          `${stats.distinctKeys.toLocaleString("ja-JP")} 種類)。値が重複しすぎて行を特定できません。`,
      });
    }
    if (stats.emptyKeyRate > HIGH_EMPTY_KEY_RATE) {
      warnings.push({
        severity: "warn",
        message: `${side} 側はキー列が空の行が ${pct(stats.emptyKeyRate)} あります。これらは必ずマッチしません。`,
      });
    }
    if (stats.collapseRate > HIGH_COLLAPSE_RATE) {
      warnings.push({
        severity: "warn",
        message:
          `${side} 側は正規化で ${stats.distinctRawKeys.toLocaleString("ja-JP")} 種類の値が ` +
          `${stats.distinctKeys.toLocaleString("ja-JP")} 種類にまとまりました。` +
          `別のものを同一視していないか確認してください。`,
      });
    }
  }

  if (analysis.multiplicity.mean > HIGH_MEAN_MULTIPLICITY) {
    warnings.push({
      severity: "warn",
      message:
        `マッチした 1 行あたり平均 ${analysis.multiplicity.mean.toFixed(1)} 行(最大 ` +
        `${analysis.multiplicity.max.toLocaleString("ja-JP")} 行)が対応しています。` +
        (kind === "extend"
          ? "どの値を採用するかが定まらないため、より一意なキー列を選んでください。"
          : "出力行数が膨らみます。"),
    });
  }

  if (analysis.normalizationGain > 0.01) {
    warnings.push({
      severity: "info",
      message:
        `正規化により、カバー率が ${pct(analysis.exactCoverageA)} から ` +
        `${pct(analysis.a.coverage)} へ向上しています。`,
    });
  }

  return warnings;
}

export interface AffinityOptions {
  keyA: string;
  keyB: string;
  level: NormalizationLevel;
  kind: MergeKind;
  maxOutputRows?: number;
}

/** 指定したキー・レベルでの相性を診断する。 */
export function buildAffinityReport(
  a: CsvTable,
  b: CsvTable,
  options: AffinityOptions,
): AffinityReport {
  const { keyA, keyB, level, kind, maxOutputRows = DEFAULT_MAX_OUTPUT_ROWS } = options;
  const analysis = analyzeKeys(a, b, keyA, keyB, level);
  const estimatedOutputRows =
    kind === "extend" ? analysis.leftOutputRows : analysis.innerOutputRows;

  return {
    keyA,
    keyB,
    level,
    kind,
    analysis,
    estimatedOutputRows,
    warnings: buildWarnings(analysis, kind, estimatedOutputRows, maxOutputRows),
  };
}

// ---------------------------------------------------------------------------
// キー列の推薦
// ---------------------------------------------------------------------------

/**
 * 推薦の総当たりで試す正規化レベル。
 * exact は basic に包含される(basic は全半角・大小・空白を吸収するだけで
 * マッチを減らさない)ため、候補から外している。
 */
const RECOMMEND_LEVELS: NormalizationLevel[] = [
  "basic",
  "address",
  "kana",
  "phone",
  "date",
];

/** 総当たりで見る列数の上限(片側あたり)。 */
const MAX_COLUMNS_SCANNED = 15;
/** 総当たりで読む行数の上限。推薦は目安なので先頭行のサンプルで足りる。 */
const RECOMMEND_SAMPLE_ROWS = 500;
/** これを下回る識別力の列は、キーとして役に立たないので候補から外す。 */
const MIN_USEFUL_DISCRIMINATION = 0.05;

export interface KeyRecommendation {
  keyA: string;
  keyB: string;
  level: NormalizationLevel;
  /** 並べ替えに使う対称な指標。 */
  jaccard: number;
  coverageA: number;
  coverageB: number;
}

export interface RecommendOptions {
  limit?: number;
  sampleRows?: number;
}

/**
 * キー列の組み合わせを総当たりで診断し、相性の良い順に返す。
 *
 * 列 × レベルごとの索引を先に作って使い回すことで、
 * 正規化の実行回数を「列数 × レベル数」に抑える(組み合わせ数ぶん
 * 正規化し直すと現実的な速度に収まらない)。
 *
 * 並べ替えは Jaccard 係数で行う。方向を持たない指標なので、
 * どちらを基準にするかを決めずに並べられる(§2-4)。
 */
export function recommendKeyPairs(
  a: CsvTable,
  b: CsvTable,
  options: RecommendOptions = {},
): KeyRecommendation[] {
  const { limit = 5, sampleRows = RECOMMEND_SAMPLE_ROWS } = options;

  const sampleA: CsvTable = { columns: a.columns, rows: a.rows.slice(0, sampleRows) };
  const sampleB: CsvTable = { columns: b.columns, rows: b.rows.slice(0, sampleRows) };
  const columnsA = a.columns.slice(0, MAX_COLUMNS_SCANNED);
  const columnsB = b.columns.slice(0, MAX_COLUMNS_SCANNED);

  // (列, レベル)ごとの索引を一度だけ作る。
  const indexes = new Map<string, ReturnType<typeof buildKeyIndex>>();
  const keyOf = (side: "A" | "B", column: string, level: NormalizationLevel) =>
    `${side} ${column} ${level}`;

  for (const level of RECOMMEND_LEVELS) {
    for (const column of columnsA) {
      indexes.set(keyOf("A", column, level), buildKeyIndex(sampleA, column, level));
    }
    for (const column of columnsB) {
      indexes.set(keyOf("B", column, level), buildKeyIndex(sampleB, column, level));
    }
  }

  const results: KeyRecommendation[] = [];

  for (const level of RECOMMEND_LEVELS) {
    for (const columnA of columnsA) {
      const indexA = indexes.get(keyOf("A", columnA, level))!;
      if (indexA.keyedRows === 0) continue;
      if (indexA.counts.size / indexA.keyedRows < MIN_USEFUL_DISCRIMINATION) continue;

      for (const columnB of columnsB) {
        const indexB = indexes.get(keyOf("B", columnB, level))!;
        if (indexB.keyedRows === 0) continue;
        if (indexB.counts.size / indexB.keyedRows < MIN_USEFUL_DISCRIMINATION) continue;

        const compared = compareKeyIndexes(indexA, indexB);
        if (compared.sharedKeys === 0) continue;

        results.push({
          keyA: columnA,
          keyB: columnB,
          level,
          jaccard: compared.jaccard,
          coverageA: compared.a.coverage,
          coverageB: compared.b.coverage,
        });
      }
    }
  }

  // 同じ列の組が複数レベルで残ることがあるため、最良のレベルだけを採る。
  const bestByPair = new Map<string, KeyRecommendation>();
  for (const r of results) {
    const pair = `${r.keyA} ${r.keyB}`;
    const current = bestByPair.get(pair);
    if (!current || r.jaccard > current.jaccard) bestByPair.set(pair, r);
  }

  return [...bestByPair.values()]
    .sort((x, y) => y.jaccard - x.jaccard || y.coverageA - x.coverageA)
    .slice(0, limit);
}
