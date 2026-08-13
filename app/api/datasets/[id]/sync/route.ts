import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { getOwnedDataset } from "@/lib/datasets";
import { RATE_LIMITS, consumeRateLimit } from "@/lib/rate-limit";
import { syncDataSource } from "@/lib/sources/sync";

/**
 * POST /api/datasets/{id}/sync
 * 手動での即時同期。自組織のデータセットのみ。
 */
export async function POST(
  _request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "ログインが必要です。" }, { status: 401 });
  }

  const { id } = await ctx.params;
  const dataset = await getOwnedDataset(id, user);
  if (!dataset) {
    return NextResponse.json(
      { error: "データセットが見つからないか、操作権限がありません。" },
      { status: 404 },
    );
  }

  const source = await prisma.dataSource.findUnique({ where: { datasetId: id } });
  if (!source) {
    return NextResponse.json(
      { error: "このデータセットにはデータソースが設定されていません。" },
      { status: 404 },
    );
  }

  // 外部への発信を伴うため組織単位で制限する。
  const limit = await consumeRateLimit(
    `source-fetch:${user.organizationId}`,
    RATE_LIMITS.sourceFetch,
  );
  if (!limit.ok) {
    return NextResponse.json(
      {
        error: `同期の実行が多すぎます。${limit.retryAfterSeconds} 秒後に再試行してください。`,
      },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } },
    );
  }

  // syncDataSource は失敗しても投げず、結果を記録して返す。
  const outcome = await syncDataSource(source, "manual");

  return NextResponse.json(
    {
      ok: outcome.ok,
      rowCount: outcome.rowCount,
      columns: outcome.columns,
      message: outcome.message,
      durationMs: outcome.durationMs,
    },
    // 取得先起因の失敗は本システムの不具合ではないので 502 で返す。
    { status: outcome.ok ? 200 : 502 },
  );
}
