import "server-only";
import { prisma } from "@/lib/prisma";
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
