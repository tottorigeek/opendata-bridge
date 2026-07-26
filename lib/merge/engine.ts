/**
 * マージエンジン(Phase 2b・本サービスの差別化の核)
 *
 * 2 つの CSV テーブルを、指定キー列ペア + 正規化レベルで名寄せ結合する。
 * inner / left / full outer をサポートし、出力列の選択・列名衝突の自動リネーム・
 * マッチ統計(マッチ率・アンマッチ例)を返す。純粋なデータ変換で副作用を持たない。
 */
import type { CsvTable } from "./csv";
import { normalizeValue, type NormalizationLevel } from "./normalize";

export type JoinType = "inner" | "left" | "full";

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
};

export type UnmatchedSample = {
  side: "A" | "B";
  key: string;
  normalizedKey: string;
  row: Record<string, string>;
};

export type MergeStats = {
  totalRowsA: number;
  totalRowsB: number;
  /** 出力行数(結合後)。 */
  outputRows: number;
  /** 少なくとも 1 件マッチした A 行の数。 */
  matchedRowsA: number;
  /** マッチ率 = matchedRowsA / totalRowsA(0〜1)。 */
  matchRate: number;
  /** アンマッチ行の先頭 10 件(A 側・B 側)。 */
  unmatchedSamples: UnmatchedSample[];
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
  let matchedRowsA = 0;
  const unmatchedSamples: UnmatchedSample[] = [];

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

  const addUnmatched = (side: "A" | "B", key: string, nk: string, row: Record<string, string>) => {
    if (unmatchedSamples.length < 10) {
      unmatchedSamples.push({ side, key, normalizedKey: nk, row });
    }
  };

  // A 行を走査。
  for (const aRow of a.rows) {
    const rawKey = aRow[config.keyA] ?? "";
    const nk = normalizeValue(rawKey, config.level);
    const matches = nk === "" ? undefined : bIndex.get(nk);

    if (matches && matches.length > 0) {
      matchedRowsA += 1;
      matchedBKeys.add(nk);
      for (const bRow of matches) {
        rows.push(buildRow(aRow, bRow));
      }
    } else {
      // アンマッチ
      addUnmatched("A", rawKey, nk, aRow);
      if (config.joinType === "left" || config.joinType === "full") {
        rows.push(buildRow(aRow, null));
      }
    }
  }

  // full outer の場合、どの A ともマッチしなかった B 行を追加。
  if (config.joinType === "full") {
    for (const bRow of b.rows) {
      const nk = normalizeValue(bRow[config.keyB] ?? "", config.level);
      if (nk === "" || !matchedBKeys.has(nk)) {
        rows.push(buildRow(null, bRow));
        addUnmatched("B", bRow[config.keyB] ?? "", nk, bRow);
      }
    }
  }

  const totalRowsA = a.rows.length;
  const matchRate = totalRowsA > 0 ? matchedRowsA / totalRowsA : 0;

  return {
    columns,
    rows,
    stats: {
      totalRowsA,
      totalRowsB: b.rows.length,
      outputRows: rows.length,
      matchedRowsA,
      matchRate,
      unmatchedSamples,
    },
  };
}
