import "server-only";
import { prisma } from "@/lib/prisma";
import { notify } from "@/lib/notifications";
import { createDatasetVersion, latestVersion } from "@/lib/versions";
import {
  DEFAULT_MAX_OUTPUT_ROWS,
  MergeLimitExceededError,
  joinTypeForKind,
  mergeTables,
  type MergeKind,
} from "./engine";
import { buildMergedCsv, readDatasetSource } from "./datasets";
import type { NormalizationLevel } from "./normalize";
import type { KeyAnalysis } from "./metrics";

/**
 * 出典の更新検知と、作り直しの品質ゲート。
 *
 * ピン留め(既定)では出典が更新されても何も起きず、「新しい版があります」と
 * 知らせるだけにする。latest は自動で作り直すが、latest を選んでも問題が
 * 消えるわけではない(キー列が消える・マッチ率が崩れる・公開済みの中身が
 * 予告なく変わる)ため、事前検証・品質ゲート・失敗時の据え置きが必須になる。
 * 設計は docs/design/merge-design.md §4-2。
 */

/** マッチ率がこの割合を下回ったら止める(前回比・累積とも)。 */
const COVERAGE_DROP_RATIO = 0.5;
/** これ未満の行数では 1 行の増減で数ポイント動くため、相対判定を使わない。 */
const MIN_ROWS_FOR_RELATIVE_CHECK = 100;

export interface StaleInput {
  side: string;
  title: string;
  datasetId: string | null;
  /** マージに使った版。 */
  usedVersion: number | null;
  /** 現在の最新版。 */
  currentVersion: number | null;
}

export interface StalenessReport {
  /** 出典のいずれかが更新されているか。 */
  stale: boolean;
  followLatest: boolean;
  inputs: StaleInput[];
}

/**
 * マージ結果の出典が更新されているかを調べる。
 *
 * 版番号の比較で判定する。内容ハッシュでも「変わったこと」は分かるが、
 * 版なら「どの版からどの版へ」まで示せる。
 */
export async function checkStaleness(
  datasetId: string,
): Promise<StalenessReport | null> {
  const lineage = await prisma.mergeLineage.findUnique({
    where: { datasetId },
    include: { inputs: true },
  });
  if (!lineage) return null;

  const inputs: StaleInput[] = await Promise.all(
    lineage.inputs.map(async (input) => {
      const current = input.datasetId
        ? await prisma.datasetVersion.findFirst({
            where: { datasetId: input.datasetId },
            orderBy: { number: "desc" },
            select: { number: true },
          })
        : null;
      return {
        side: input.side,
        title: input.title,
        datasetId: input.datasetId,
        usedVersion: input.versionNumber,
        currentVersion: current?.number ?? null,
      };
    }),
  );

  const stale = inputs.some((i) => {
    if (i.currentVersion === null) return false;
    // マージ時に版が無かった出典は番号で比べられない。その後に版ができた
    // ということは中身が書き換わったということなので(同一内容では版を
    // 作らないため)、更新ありとして扱う。
    if (i.usedVersion === null) return true;
    return i.currentVersion > i.usedVersion;
  });

  return { stale, followLatest: lineage.followLatest, inputs };
}

export type GateVerdict =
  | { pass: true; message: string }
  | { pass: false; message: string };

/**
 * 作り直した結果を適用してよいかを判定する。
 *
 * 止めることのコストは通知 1 件、見逃すことのコストは誤ったデータの公開であり、
 * コストが非対称なので、判断に迷う場合は止める側に倒す。
 */
export function evaluateGate(
  baseline: KeyAnalysis | null,
  previous: KeyAnalysis | null,
  next: KeyAnalysis,
): GateVerdict {
  const pct = (v: number) => `${(v * 100).toFixed(1)}%`;

  // 行数が少ないと 1 行の増減で数ポイント動くため、相対判定は使わない。
  if (next.a.totalRows < MIN_ROWS_FOR_RELATIVE_CHECK) {
    return {
      pass: true,
      message:
        `カバー率 ${pct(next.a.coverage)}(${next.a.totalRows} 行と少ないため、` +
        `相対的な低下による停止判定は行いません)。`,
    };
  }

  const checks: { label: string; before: number }[] = [];
  if (previous) checks.push({ label: "前回", before: previous.a.coverage });
  if (baseline) checks.push({ label: "初回", before: baseline.a.coverage });

  for (const check of checks) {
    if (check.before <= 0) continue;
    if (next.a.coverage < check.before * COVERAGE_DROP_RATIO) {
      return {
        pass: false,
        message:
          `カバー率が${check.label}の ${pct(check.before)} から ` +
          `${pct(next.a.coverage)} へ大きく低下したため、自動更新を止めました。` +
          `出典の変更内容を確認してから手動で作り直してください。`,
      };
    }
  }

  return {
    pass: true,
    message: `カバー率 ${pct(next.a.coverage)} で更新しました。`,
  };
}

export function parseAnalysis(raw: string): KeyAnalysis | null {
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" && "a" in parsed
      ? (parsed as KeyAnalysis)
      : null;
  } catch {
    return null;
  }
}

export interface RefreshOutcome {
  /** 作り直しを適用したか。 */
  applied: boolean;
  message: string;
  /** 適用できなかった理由の分類。 */
  reason?: "no_lineage" | "source_gone" | "read_failed" | "key_missing" | "gate" | "too_large";
}

/**
 * 記録済みのマージ設定で作り直す。
 *
 * 認可はこの関数では行わない(呼び出し側の責務)。手動実行と定期実行の
 * 両方から使うため、通知や版の作成まで含めてここに閉じている。
 */
export async function refreshMergedDataset(
  datasetId: string,
): Promise<RefreshOutcome> {
  const dataset = await prisma.dataset.findUnique({ where: { id: datasetId } });
  if (!dataset) return { applied: false, message: "データセットが見つかりません。", reason: "no_lineage" };

  const lineage = await prisma.mergeLineage.findUnique({
    where: { datasetId },
    include: { inputs: { orderBy: { side: "asc" } } },
  });
  if (!lineage) {
    return { applied: false, message: "マージの来歴がありません。", reason: "no_lineage" };
  }

  const inputA = lineage.inputs.find((i) => i.side === "A");
  const inputB = lineage.inputs.find((i) => i.side === "B");
  if (!inputA?.datasetId || !inputB?.datasetId) {
    return {
      applied: false,
      message: "出典のデータセットが削除されているため、作り直せません。",
      reason: "source_gone",
    };
  }

  const [dsA, dsB] = await Promise.all([
    prisma.dataset.findUnique({ where: { id: inputA.datasetId } }),
    prisma.dataset.findUnique({ where: { id: inputB.datasetId } }),
  ]);
  if (!dsA || !dsB) {
    return {
      applied: false,
      message: "出典のデータセットが見つかりません。",
      reason: "source_gone",
    };
  }

  let sourceA;
  let sourceB;
  try {
    [sourceA, sourceB] = await Promise.all([
      readDatasetSource(dsA),
      readDatasetSource(dsB),
    ]);
  } catch (e) {
    const message = e instanceof Error ? e.message : "CSV の読み込みに失敗しました。";
    return { applied: false, message, reason: "read_failed" };
  }

  // 事前検証: キー列が新しい版にも存在するか。閾値以前の問題なのでここで弾く。
  if (
    !sourceA.table.columns.includes(lineage.keyA) ||
    !sourceB.table.columns.includes(lineage.keyB)
  ) {
    const message =
      `出典のキー列(${lineage.keyA} / ${lineage.keyB})が見つからなくなったため、` +
      `作り直しを中止しました。列名の変更を確認してください。`;
    await recordOutcome(datasetId, message);
    await notifyOwners(dataset.organizationId, dataset.id, dataset.title, message);
    return { applied: false, message, reason: "key_missing" };
  }

  let result;
  try {
    result = mergeTables(sourceA.table, sourceB.table, {
      keyA: lineage.keyA,
      keyB: lineage.keyB,
      level: lineage.level as NormalizationLevel,
      joinType: joinTypeForKind(lineage.kind as MergeKind),
      datasetNameA: dsA.title,
      datasetNameB: dsB.title,
      maxOutputRows: DEFAULT_MAX_OUTPUT_ROWS,
    });
  } catch (e) {
    if (e instanceof MergeLimitExceededError) {
      await recordOutcome(datasetId, e.message);
      return { applied: false, message: e.message, reason: "too_large" };
    }
    throw e;
  }

  const verdict = evaluateGate(
    parseAnalysis(lineage.baselineStatsJson),
    parseAnalysis(lineage.statsJson),
    result.stats.analysis,
  );

  if (!verdict.pass) {
    await recordOutcome(datasetId, verdict.message);
    await notifyOwners(dataset.organizationId, dataset.id, dataset.title, verdict.message);
    return { applied: false, message: verdict.message, reason: "gate" };
  }

  await createDatasetVersion({
    datasetId,
    content: buildMergedCsv(result.columns, result.rows),
    columns: result.columns,
    rowCount: result.rows.length,
    source: "MERGE",
    note: "出典の更新に伴う作り直し",
  });

  const [versionA, versionB] = await Promise.all([
    latestVersion(dsA.id),
    latestVersion(dsB.id),
  ]);

  await prisma.$transaction([
    prisma.mergeLineage.update({
      where: { datasetId },
      data: {
        statsJson: JSON.stringify(result.stats.analysis),
        columnOriginsJson: JSON.stringify(result.columnOrigins),
        refreshedAt: new Date(),
        lastRefreshMessage: verdict.message,
      },
    }),
    prisma.mergeLineageInput.update({
      where: { id: inputA.id },
      data: { versionNumber: versionA?.number ?? null, contentHash: sourceA.contentHash },
    }),
    prisma.mergeLineageInput.update({
      where: { id: inputB.id },
      data: { versionNumber: versionB?.number ?? null, contentHash: sourceB.contentHash },
    }),
  ]);

  return { applied: true, message: verdict.message };
}

async function recordOutcome(datasetId: string, message: string) {
  await prisma.mergeLineage.update({
    where: { datasetId },
    data: { lastRefreshMessage: message },
  });
}

/** 作り直しを止めたことを、所有組織のメンバーに知らせる。 */
async function notifyOwners(
  organizationId: string,
  datasetId: string,
  title: string,
  message: string,
) {
  const members = await prisma.user.findMany({
    where: { organizationId },
    select: { id: true },
  });
  await notify({
    userIds: members.map((m) => m.id),
    type: "MERGE_REFRESH_BLOCKED",
    title: `自動更新を止めました: ${title}`,
    body: message,
    link: `/dashboard/datasets/${datasetId}`,
  });
}

/**
 * latest 追従が有効で、出典が更新されているマージ結果を作り直す。
 * 定期実行から呼ぶ。
 */
export async function refreshStaleFollowers(limit = 25) {
  const candidates = await prisma.mergeLineage.findMany({
    where: { followLatest: true },
    orderBy: [{ refreshedAt: { sort: "asc", nulls: "first" } }],
    take: limit,
    select: { datasetId: true },
  });

  const results: { datasetId: string; applied: boolean; message: string }[] = [];
  for (const candidate of candidates) {
    const staleness = await checkStaleness(candidate.datasetId);
    if (!staleness?.stale) continue;
    const outcome = await refreshMergedDataset(candidate.datasetId);
    results.push({
      datasetId: candidate.datasetId,
      applied: outcome.applied,
      message: outcome.message,
    });
  }
  return results;
}
