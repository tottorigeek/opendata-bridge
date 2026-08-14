/**
 * マージ結果の来歴(provenance)の記録と参照。
 *
 * 説明文に日本語で書くのではなく構造化して保存することで、
 *   - 元データセットを辿れる(多段のマージでも祖先を追える)
 *   - 統計を前回値と機械的に比較できる(自動追従の品質ゲートの基準)
 *   - 元が削除・改名されても、当時の事実が残る
 * が成立する。設計は docs/design/merge-design.md §3 を参照。
 */
import "server-only";
import type { Dataset, Organization } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { ColumnOrigin, MergeKind } from "./engine";
import type { KeyAnalysis } from "./metrics";

/** 祖先を辿る深さの上限。来歴グラフは構造上つねに非巡回だが、暴走を防ぐ。 */
const MAX_ANCESTRY_DEPTH = 20;

export interface LineageInputRecord {
  side: "A" | "B";
  dataset: Dataset & { organization: Organization };
  contentHash: string;
  /** マージに使った版の番号。版を持たないデータでは null。 */
  versionNumber: number | null;
}

export interface RecordLineageParams {
  /** マージで生成されたデータセットの ID。 */
  datasetId: string;
  kind: MergeKind;
  keyA: string;
  keyB: string;
  level: string;
  analysis: KeyAnalysis;
  columnOrigins: ColumnOrigin[];
  inputs: LineageInputRecord[];
}

/**
 * マージの来歴を保存する。
 *
 * 入力側は参照(datasetId)に加えて、マージ時点のタイトル・ライセンス・
 * 組織名・行数・内容ハッシュを写しておく。来歴は「その時点の事実の記録」であり、
 * 元データセットが後から変わっても書き換わってはならない。
 */
export async function recordMergeLineage(params: RecordLineageParams) {
  return prisma.mergeLineage.create({
    data: {
      datasetId: params.datasetId,
      kind: params.kind,
      keyA: params.keyA,
      keyB: params.keyB,
      level: params.level,
      statsJson: JSON.stringify(params.analysis),
      // 初回の統計は基準線として別に持つ。前回比だけだと、毎回閾値を割らずに
      // 徐々に劣化する経路を素通りしてしまうため(§4-2)。
      baselineStatsJson: JSON.stringify(params.analysis),
      columnOriginsJson: JSON.stringify(params.columnOrigins),
      inputs: {
        create: params.inputs.map((input) => ({
          side: input.side,
          datasetId: input.dataset.id,
          title: input.dataset.title,
          license: input.dataset.license,
          organizationName: input.dataset.organization.name,
          rowCount: input.dataset.rowCount,
          contentHash: input.contentHash,
          versionNumber: input.versionNumber,
        })),
      },
    },
  });
}

export interface LineageInputView {
  side: string;
  /** 元データセットが残っていれば ID。削除済みなら null。 */
  datasetId: string | null;
  title: string;
  license: string;
  organizationName: string;
  rowCount: number;
  contentHash: string;
  /** マージに使った版の番号。版の導入前の来歴では null。 */
  versionNumber: number | null;
  /** 元データセットが今も存在するか。false なら写しのみで辿れない。 */
  available: boolean;
  /**
   * マージ時点から出典の中身が変わっているか。
   * 現状は内容ハッシュの比較で判定する(版の導入後は版番号で判定する)。
   * 元が削除済み・ハッシュ未記録のときは null(判定不能)。
   */
  changed: boolean | null;
}

export interface LineageView {
  datasetId: string;
  kind: string;
  keyA: string;
  keyB: string;
  level: string;
  analysis: KeyAnalysis | null;
  columnOrigins: ColumnOrigin[];
  createdAt: Date;
  inputs: LineageInputView[];
}

function parseJson<T>(raw: string, fallback: T): T {
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

/**
 * 指定データセットの来歴を取得する。マージ由来でなければ null。
 *
 * 出典が変わったかどうかは、記録した内容ハッシュと現在の CSV のハッシュを
 * 比べて判定したいが、現在の CSV を読むのは重い。ここでは元データセットの
 * 存在確認までを行い、ハッシュ比較は呼び出し側が必要なときに行う。
 */
export async function getLineage(datasetId: string): Promise<LineageView | null> {
  const lineage = await prisma.mergeLineage.findUnique({
    where: { datasetId },
    include: { inputs: { orderBy: { side: "asc" } } },
  });
  if (!lineage) return null;

  return {
    datasetId: lineage.datasetId,
    kind: lineage.kind,
    keyA: lineage.keyA,
    keyB: lineage.keyB,
    level: lineage.level,
    analysis: parseJson<KeyAnalysis | null>(lineage.statsJson, null),
    columnOrigins: parseJson<ColumnOrigin[]>(lineage.columnOriginsJson, []),
    createdAt: lineage.createdAt,
    inputs: lineage.inputs.map((input) => ({
      side: input.side,
      datasetId: input.datasetId,
      title: input.title,
      license: input.license,
      organizationName: input.organizationName,
      rowCount: input.rowCount,
      contentHash: input.contentHash,
      versionNumber: input.versionNumber,
      available: input.datasetId !== null,
      changed: null,
    })),
  };
}

export interface AncestryNode {
  /** 根(問い合わせたデータセット)からの距離。 */
  depth: number;
  lineage: LineageView;
}

/**
 * 祖先の来歴をすべて辿る(多段マージの追跡)。
 *
 * 来歴グラフは構造上つねに非巡回である(自分より後に作られたデータセットを
 * 親に持てない)ため循環検出は不要だが、深さの上限だけ設けている。
 * 同じデータセットが複数経路で現れることはあるので、訪問済みは記録する。
 */
export async function getAncestry(datasetId: string): Promise<AncestryNode[]> {
  const nodes: AncestryNode[] = [];
  const visited = new Set<string>([datasetId]);
  let frontier = [datasetId];

  for (let depth = 0; depth < MAX_ANCESTRY_DEPTH && frontier.length > 0; depth += 1) {
    const lineages = await Promise.all(frontier.map((id) => getLineage(id)));
    const next: string[] = [];

    for (const lineage of lineages) {
      if (!lineage) continue;
      nodes.push({ depth, lineage });
      for (const input of lineage.inputs) {
        if (input.datasetId && !visited.has(input.datasetId)) {
          visited.add(input.datasetId);
          next.push(input.datasetId);
        }
      }
    }
    frontier = next;
  }

  return nodes;
}
