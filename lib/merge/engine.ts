/**
 * マージエンジン(Phase 2b・本サービスの差別化の核)
 *
 * 2 つの CSV テーブルを、指定キー列ペア + 正規化レベルで名寄せ結合する。
 * inner / left / full outer をサポートし、出力列の選択・列名衝突の自動リネーム・
 * マッチ統計(マッチ率・アンマッチ例)を返す。純粋なデータ変換で副作用を持たない。
 */
import type { CsvTable } from "./csv";
import { analyzeKeys, type KeyAnalysis } from "./metrics";
import { normalizeValue, type NormalizationLevel } from "./normalize";

/**
 * 低レベルの結合種別。
 *
 * 利用者に見せるのは MergeKind(項目拡張型 / 共通抽出型)であり、
 * この型は API からは直接指定できない。"full" は完全外部結合の原始的な
 * 実装として残しているが、マージ型からは到達しない
 * (完全外部結合の用途は相性チェックの診断であり、そちらは行を組み立てずに
 * lib/merge/metrics.ts で計算する。docs/design/merge-design.md §1-2)。
 */
export type JoinType = "inner" | "left" | "full";

/**
 * 利用者に見せるマージ型。「どの行が残るか」を名前で明言する 2 種。
 * docs/design/merge-design.md §1-1 を参照。
 */
export type MergeKind = "extend" | "intersect";

export const MERGE_KINDS: {
  value: MergeKind;
  label: string;
  /** 利用者に示す問い。型の選択はこの文で行う。 */
  question: string;
  /** 行と列がどうなるかの説明。 */
  effect: string;
  joinType: JoinType;
}[] = [
  {
    value: "extend",
    label: "項目拡張型",
    question: "手元のデータに、別のデータの項目を足したい",
    effect: "手元のデータの行はすべて残り、列(項目)が増えます。",
    joinType: "left",
  },
  {
    value: "intersect",
    label: "共通抽出型",
    question: "両方に存在するものだけを取り出したい",
    effect: "両方にある行だけが残り、列(項目)が増えます。",
    joinType: "inner",
  },
];

/** マージ型に対応する結合種別を返す。 */
export function joinTypeForKind(kind: MergeKind): JoinType {
  return kind === "extend" ? "left" : "inner";
}

/**
 * マージ結果の最大行数。多対多結合による行数爆発を止める。
 * 相性チェックの事前警告(lib/merge/affinity.ts)も同じ値を基準にする。
 */
export const DEFAULT_MAX_OUTPUT_ROWS = 500_000;

/** 出力に含める 1 列の指定(どちらのデータセットのどの列か)。 */
export type OutputColumn = { source: "A" | "B"; column: string };

export type MergeConfig = {
  /** データセット A のキー列名。 */
  keyA: string;
  /** データセット B のキー列名。 */
  keyB: string;
  /** キー比較に使う正規化レベル。 */
  level: NormalizationLevel;
  /** 結合タイプ。 */
  joinType: JoinType;
  /** 出力列。未指定(空配列)なら A の全列 + B の全列。 */
  outputColumns?: OutputColumn[];
  /** 列名衝突時のリネーム用ラベル。 */
  datasetNameA: string;
  datasetNameB: string;
  /**
   * 出力行数の上限。超えた時点で MergeLimitExceededError を投げる。
   * キーのカーディナリティが低いと結合は多対多になり、出力は最大 |A|×|B| 行まで
   * 膨らむ。全行をメモリ上に持つ設計のため、上限が無いとプロセスが落ちる。
   */
  maxOutputRows?: number;
};

/** 出力行数の上限を超えたときに投げるエラー。呼び出し側で 413 に変換する。 */
export class MergeLimitExceededError extends Error {
  constructor(readonly maxOutputRows: number) {
    super(
      `マージ結果が上限(${maxOutputRows.toLocaleString()} 行)を超えました。` +
        `キー列の値が重複しすぎている可能性があります。`,
    );
    this.name = "MergeLimitExceededError";
  }
}

export type MergeStats = {
  /** 出力行数(結合後)。 */
  outputRows: number;
  /**
   * キー照合の指標一式。相性チェックと同じ計算(lib/merge/metrics.ts)から得るため、
   * 事前診断で見た数値とマージ後に記録される数値が一致する。
   */
  analysis: KeyAnalysis;
};

export type MergeResult = {
  columns: string[];
  rows: Record<string, string>[];
  stats: MergeStats;
};

/** データセット名を列名プレフィックスに使えるよう軽くサニタイズする。 */
function safeLabel(name: string): string {
  return (name || "data").replace(/[\s,]+/g, "_").trim() || "data";
}

/**
 * 選択された出力列から最終列名を決定する。
 * 同名が複数現れる場合は「データセット名_列名」に自動リネームし、
 * それでも衝突する場合は連番を付与して一意化する。
 */
function resolveColumnNames(
  outputs: OutputColumn[],
  labelA: string,
  labelB: string,
): { source: "A" | "B"; column: string; name: string }[] {
  // 素の列名の出現回数を数える。
  const counts = new Map<string, number>();
  for (const o of outputs) {
    counts.set(o.column, (counts.get(o.column) ?? 0) + 1);
  }

  const used = new Set<string>();
  return outputs.map((o) => {
    let name = o.column;
    if ((counts.get(o.column) ?? 0) > 1) {
      // 衝突: データセット名を前置する。
      name = `${o.source === "A" ? labelA : labelB}_${o.column}`;
    }
    // 前置してもなお衝突する場合は連番。
    let candidate = name;
    let i = 2;
    while (used.has(candidate)) {
      candidate = `${name}_${i}`;
      i += 1;
    }
    used.add(candidate);
    return { source: o.source, column: o.column, name: candidate };
  });
}

/** 既定の出力列(A 全列 → B 全列)を組み立てる。 */
export function defaultOutputColumns(a: CsvTable, b: CsvTable): OutputColumn[] {
  return [
    ...a.columns.map((column) => ({ source: "A" as const, column })),
    ...b.columns.map((column) => ({ source: "B" as const, column })),
  ];
}

/**
 * 2 つのテーブルを結合する。
 *
 * @param a データセット A(左)
 * @param b データセット B(右)
 * @param config 結合設定
 */
export function mergeTables(a: CsvTable, b: CsvTable, config: MergeConfig): MergeResult {
  const labelA = safeLabel(config.datasetNameA);
  const labelB = safeLabel(config.datasetNameB);

  const outputs =
    config.outputColumns && config.outputColumns.length > 0
      ? config.outputColumns
      : defaultOutputColumns(a, b);
  const resolved = resolveColumnNames(outputs, labelA, labelB);
  const columns = resolved.map((r) => r.name);

  // B 側を正規化キーでインデックス化。
  const bIndex = new Map<string, Record<string, string>[]>();
  for (const row of b.rows) {
    const nk = normalizeValue(row[config.keyB] ?? "", config.level);
    if (nk === "") continue; // 空キーはマッチ対象外
    const bucket = bIndex.get(nk);
    if (bucket) bucket.push(row);
    else bIndex.set(nk, [row]);
  }

  const matchedBKeys = new Set<string>();
  const rows: Record<string, string>[] = [];

  // 上限は「行を push する直前」に見る。全部組み立ててから切り詰めるのでは、
  // その時点で既にメモリを使い切っているため意味がない。
  const maxOutputRows = config.maxOutputRows ?? Number.POSITIVE_INFINITY;
  const pushRow = (row: Record<string, string>) => {
    if (rows.length >= maxOutputRows) {
      throw new MergeLimitExceededError(maxOutputRows);
    }
    rows.push(row);
  };

  const buildRow = (
    aRow: Record<string, string> | null,
    bRow: Record<string, string> | null,
  ): Record<string, string> => {
    const out: Record<string, string> = {};
    for (const r of resolved) {
      const src = r.source === "A" ? aRow : bRow;
      out[r.name] = src ? (src[r.column] ?? "") : "";
    }
    return out;
  };

  // A 行を走査。
  for (const aRow of a.rows) {
    const nk = normalizeValue(aRow[config.keyA] ?? "", config.level);
    const matches = nk === "" ? undefined : bIndex.get(nk);

    if (matches && matches.length > 0) {
      matchedBKeys.add(nk);
      for (const bRow of matches) {
        pushRow(buildRow(aRow, bRow));
      }
    } else if (config.joinType === "left" || config.joinType === "full") {
      pushRow(buildRow(aRow, null));
    }
  }

  // full outer の場合、どの A ともマッチしなかった B 行を追加。
  if (config.joinType === "full") {
    for (const bRow of b.rows) {
      const nk = normalizeValue(bRow[config.keyB] ?? "", config.level);
      if (nk === "" || !matchedBKeys.has(nk)) {
        pushRow(buildRow(null, bRow));
      }
    }
  }

  return {
    columns,
    rows,
    stats: {
      outputRows: rows.length,
      // 統計は相性チェックと同じ計算を通す。行の組み立てとは独立した走査になるが、
      // 事前診断とマージ後の記録が一致することを優先する。
      analysis: analyzeKeys(a, b, config.keyA, config.keyB, config.level),
    },
  };
}
