import "server-only";
import { createHash } from "node:crypto";
import type { VersionSource } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  datasetVersionStorageKey,
  deleteCsvObject,
  readCsvObject,
  saveCsvObject,
} from "@/lib/storage";

/**
 * データセットの版。
 *
 * 版を作る経路をこのモジュールに一本化する。Dataset 側の
 * filePath / columnsJson / rowCount は最新版の値を写した非正規化なので、
 * 版の作成と写しの更新を必ず同じ場所で行い、ずれないようにする。
 *
 * 識別子を連番にしているのは、日付だと同日の複数更新で衝突するうえ、
 * 「データの基準日」と混同されるため(docs/design/merge-design.md §4-3)。
 */

/**
 * 参照されていない版を残す数。実データの容量を見て調整する前提の初期値。
 */
const KEEP_VERSIONS = 5;

export function hashCsv(content: Buffer | string): string {
  const body = typeof content === "string" ? Buffer.from(content, "utf-8") : content;
  return createHash("sha256").update(body).digest("hex");
}

export interface CreateVersionParams {
  datasetId: string;
  content: Buffer | string;
  columns: string[];
  rowCount: number;
  source: VersionSource;
  /** 版が作られた経緯の短い説明。 */
  note?: string;
}

export interface CreateVersionResult {
  number: number;
  filePath: string;
  contentHash: string;
  /** 内容が直前の版と同一で、新しい版を作らなかった場合に true。 */
  unchanged: boolean;
}

/**
 * 新しい版を作る。
 *
 * 直前の版と内容が同一なら版を作らない。外部データソースの定期同期は
 * 中身が変わらなくても走るため、そのたびに版が増えると保持ポリシーを
 * すぐ使い切ってしまう。
 */
export async function createDatasetVersion(
  params: CreateVersionParams,
): Promise<CreateVersionResult> {
  const contentHash = hashCsv(params.content);

  const latest = await prisma.datasetVersion.findFirst({
    where: { datasetId: params.datasetId },
    orderBy: { number: "desc" },
  });

  if (latest && latest.contentHash && latest.contentHash === contentHash) {
    return {
      number: latest.number,
      filePath: latest.filePath,
      contentHash,
      unchanged: true,
    };
  }

  const number = (latest?.number ?? 0) + 1;
  const filePath = datasetVersionStorageKey(params.datasetId, number);

  // 先にストレージへ書く。DB に行があるのに実体が無い状態を避ける。
  await saveCsvObject(filePath, params.content);

  await prisma.$transaction([
    prisma.datasetVersion.create({
      data: {
        datasetId: params.datasetId,
        number,
        filePath,
        columnsJson: JSON.stringify(params.columns),
        rowCount: params.rowCount,
        contentHash,
        source: params.source,
        note: params.note ?? "",
      },
    }),
    // Dataset 側は最新版の写し。読み取り経路は従来どおりここを見る。
    prisma.dataset.update({
      where: { id: params.datasetId },
      data: {
        filePath,
        columnsJson: JSON.stringify(params.columns),
        rowCount: params.rowCount,
      },
    }),
  ]);

  // 版が増えたので、参照されていない古い版を整理する。
  await pruneVersions(params.datasetId);

  return { number, filePath, contentHash, unchanged: false };
}

/**
 * 参照されていない古い版を、直近 KEEP_VERSIONS 件だけ残して削除する。
 *
 * 「古い順に N 個残す」では不十分で、参照の有無が第一条件になる。
 * マージの来歴がピン留めしている版を消すと、その来歴が指す先が失われ
 * 「過去のマージを再現できる」という版の目的そのものが壊れるため
 * (docs/design/merge-design.md §4-4)。
 *
 * 最新版も常に残す(現在の中身なので当然)。
 */
export async function pruneVersions(datasetId: string): Promise<number> {
  const versions = await prisma.datasetVersion.findMany({
    where: { datasetId },
    orderBy: { number: "desc" },
  });
  if (versions.length <= KEEP_VERSIONS) return 0;

  // この データセットの版を参照している来歴を集める。
  const referenced = await prisma.mergeLineageInput.findMany({
    where: { datasetId, versionNumber: { not: null } },
    select: { versionNumber: true },
  });
  const pinned = new Set(referenced.map((r) => r.versionNumber));

  // 新しい順に KEEP_VERSIONS 件は無条件で残し、それ以降は参照されていれば残す。
  const removable = versions
    .slice(KEEP_VERSIONS)
    .filter((v) => !pinned.has(v.number));
  if (removable.length === 0) return 0;

  // 先に実体を消し、そのあと行を消す。逆順だと、行が無いのに実体が残る
  // 「参照できないゴミ」が生まれる。
  for (const version of removable) {
    await deleteCsvObject(version.filePath);
  }
  const result = await prisma.datasetVersion.deleteMany({
    where: { id: { in: removable.map((v) => v.id) } },
  });
  return result.count;
}

/** 版の一覧(新しい順)。 */
export async function listVersions(datasetId: string) {
  return prisma.datasetVersion.findMany({
    where: { datasetId },
    orderBy: { number: "desc" },
  });
}

/** 最新版。まだ版が無ければ null。 */
export async function latestVersion(datasetId: string) {
  return prisma.datasetVersion.findFirst({
    where: { datasetId },
    orderBy: { number: "desc" },
  });
}

/** 版番号を指定して取得する。 */
export async function getVersion(datasetId: string, number: number) {
  return prisma.datasetVersion.findUnique({
    where: { datasetId_number: { datasetId, number } },
  });
}

/** 指定した版の CSV 本文を読む。存在しなければ null。 */
export async function readVersionCsv(
  datasetId: string,
  number: number,
): Promise<Buffer | null> {
  const version = await getVersion(datasetId, number);
  if (!version) return null;
  return readCsvObject(version.filePath);
}

/** 表示用のラベル(例: 「第 3 版(2026-08-13)」)。 */
export function formatVersionLabel(version: {
  number: number;
  createdAt: Date;
}): string {
  const date = new Intl.DateTimeFormat("ja-JP", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(version.createdAt);
  return `第 ${version.number} 版(${date})`;
}

export const VERSION_SOURCE_LABEL: Record<string, string> = {
  UPLOAD: "アップロード",
  SYNC: "外部同期",
  MERGE: "マージ",
};
