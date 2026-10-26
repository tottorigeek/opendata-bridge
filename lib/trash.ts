import "server-only";
import { prisma } from "@/lib/prisma";
import { deleteAllDatasetObjects } from "@/lib/storage";

/**
 * データセットのゴミ箱。
 *
 * 「削除」はまずゴミ箱に入れるだけにして、元に戻せるようにする。ゴミ箱の間は
 * status = TRASHED なので、公開系の処理(カタログ・公開 API・サイトマップ・OGP 画像など、
 * PUBLISHED だけを見るもの)からは自動的に見えなくなる。
 *
 * 元に戻すと DRAFT になる。公開していたデータでも、承認をやり直すまで公開されない。
 * 個人情報の混入などで取り下げたデータが、うっかり再公開されないようにするため。
 */

/** ゴミ箱に入れる。 */
export async function moveToTrash(datasetId: string): Promise<void> {
  await prisma.dataset.update({
    where: { id: datasetId },
    data: { status: "TRASHED", trashedAt: new Date() },
  });
}

/** ゴミ箱から元に戻す(下書きに戻る)。 */
export async function restoreFromTrash(datasetId: string): Promise<void> {
  await prisma.dataset.update({
    where: { id: datasetId },
    data: { status: "DRAFT", trashedAt: null },
  });
}

export type PurgeResult = { ok: true } | { ok: false; error: string };

/**
 * 完全に削除する。保存しているファイル(全版)を消してから DB の行を消す。
 *
 * 先に実体を消すのは、逆順で実体の削除に失敗すると、アプリから辿れないのに
 * ストレージには残るファイルが生まれるため(pruneVersions と同じ順序)。
 * 取り下げの理由が個人情報の混入であることもあるので、実体を残したまま
 * 「削除できた」と扱ってはならない。
 */
export async function purgeDataset(datasetId: string): Promise<PurgeResult> {
  // 版の行はデータセットと一緒にカスケード削除されるため、先にファイルの場所を控える。
  const versions = await prisma.datasetVersion.findMany({
    where: { datasetId },
    select: { filePath: true },
  });

  try {
    await deleteAllDatasetObjects(datasetId, versions.map((v) => v.filePath));
  } catch (e) {
    console.error("[trash/purge] ストレージの削除に失敗しました", { datasetId, error: e });
    return {
      ok: false,
      error: "ファイルの削除に失敗したため、完全には削除できませんでした。時間をおいて再度お試しください。",
    };
  }

  await prisma.dataset.delete({ where: { id: datasetId } });

  // 上の削除から行の削除までの間に、外部同期などが新しい版を書き込んでいた場合に備え、
  // もう一度フォルダごと掃除する。行は既に無いので、ここでの失敗はログに残すに留める。
  try {
    await deleteAllDatasetObjects(datasetId);
  } catch (e) {
    console.error("[trash/purge] 削除後の再掃除に失敗しました", { datasetId, error: e });
  }
  return { ok: true };
}
