import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { syncDataSource } from "@/lib/sources/sync";
import { refreshStaleFollowers } from "@/lib/merge/refresh";

/**
 * GET /api/cron/sync
 * syncMode = SCHEDULED のデータソースをまとめて同期し、続けて
 * latest 追従が有効なマージ結果のうち出典が更新されたものを作り直す
 * (Vercel Cron から呼ぶ)。
 *
 * 同期の直後に作り直すのは、出典が新しくなった直後こそ追従したいタイミングだから。
 * 作り直しは品質ゲートを通り、通らなければ適用せず通知だけ行う。
 *
 * 認証: `Authorization: Bearer <CRON_SECRET>`。
 * Vercel Cron は CRON_SECRET を設定しておくと自動でこのヘッダを付ける。
 * CRON_SECRET が未設定なら、誰でも叩ける状態になるのを避けるため 503 で拒否する
 * (「未設定なら素通し」にすると外部から同期を無限に走らせられてしまう)。
 */

/** 1 回の実行で処理する最大件数(関数の実行時間上限に収めるため)。 */
const MAX_SOURCES_PER_RUN = 25;

function isAuthorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;

  const header = request.headers.get("authorization") ?? "";
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  if (!match) return false;

  const provided = Buffer.from(match[1].trim(), "utf8");
  const expected = Buffer.from(secret, "utf8");
  // 長さが違うと timingSafeEqual が投げるので先に弾く。
  if (provided.length !== expected.length) return false;
  return timingSafeEqual(provided, expected);
}

export async function GET(request: Request) {
  if (!process.env.CRON_SECRET) {
    return NextResponse.json(
      { error: "CRON_SECRET が未設定のため定期同期は無効です。" },
      { status: 503 },
    );
  }
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "認証が必要です。" }, { status: 401 });
  }

  // 最後に同期した時刻が古いものから処理し、件数超過時も順番に回るようにする。
  const sources = await prisma.dataSource.findMany({
    where: { syncMode: "SCHEDULED" },
    orderBy: [{ lastSyncedAt: { sort: "asc", nulls: "first" } }],
    take: MAX_SOURCES_PER_RUN,
  });

  const results: {
    datasetId: string;
    ok: boolean;
    rowCount: number;
    message: string;
  }[] = [];

  // 外部サイトへ同時に大量のリクエストを投げないよう直列で回す。
  for (const source of sources) {
    const outcome = await syncDataSource(source, "scheduled");
    results.push({
      datasetId: source.datasetId,
      ok: outcome.ok,
      rowCount: outcome.rowCount,
      message: outcome.message,
    });
  }

  // 出典が新しくなったので、latest 追従のマージ結果を作り直す。
  const refreshed = await refreshStaleFollowers();

  return NextResponse.json({
    processed: results.length,
    succeeded: results.filter((r) => r.ok).length,
    failed: results.filter((r) => !r.ok).length,
    results,
    refresh: {
      processed: refreshed.length,
      applied: refreshed.filter((r) => r.applied).length,
      blocked: refreshed.filter((r) => !r.applied).length,
      results: refreshed,
    },
  });
}
