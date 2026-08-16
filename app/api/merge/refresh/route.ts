import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { getOwnedDataset } from "@/lib/datasets";
import { refreshMergedDataset } from "@/lib/merge/refresh";
import { RATE_LIMITS, consumeRateLimit } from "@/lib/rate-limit";

/**
 * PATCH /api/merge/refresh
 * ピン留め / latest を切り替える。
 */
export async function PATCH(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "ログインが必要です。" }, { status: 401 });
  }

  let body: { datasetId?: string; followLatest?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "リクエスト形式が不正です。" }, { status: 400 });
  }
  if (typeof body.followLatest !== "boolean" || !body.datasetId) {
    return NextResponse.json({ error: "設定値が不正です。" }, { status: 400 });
  }

  const dataset = await getOwnedDataset(body.datasetId, user);
  if (!dataset) {
    return NextResponse.json(
      { error: "データセットが見つからないか、操作権限がありません。" },
      { status: 404 },
    );
  }

  await prisma.mergeLineage.update({
    where: { datasetId: dataset.id },
    data: { followLatest: body.followLatest },
  });
  return NextResponse.json({ ok: true, followLatest: body.followLatest });
}

/**
 * POST /api/merge/refresh
 * 記録済みのマージ設定で作り直す(手動実行)。
 * 実処理は lib/merge/refresh.ts にあり、定期実行と同じ経路を通る。
 */
export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "ログインが必要です。" }, { status: 401 });
  }

  let body: { datasetId?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "リクエスト形式が不正です。" }, { status: 400 });
  }
  if (!body.datasetId) {
    return NextResponse.json({ error: "データセットが不正です。" }, { status: 400 });
  }

  const dataset = await getOwnedDataset(body.datasetId, user);
  if (!dataset) {
    return NextResponse.json(
      { error: "データセットが見つからないか、操作権限がありません。" },
      { status: 404 },
    );
  }

  const limit = await consumeRateLimit(`merge:${user.id}`, RATE_LIMITS.merge);
  if (!limit.ok) {
    return NextResponse.json(
      { error: `実行が多すぎます。${limit.retryAfterSeconds} 秒後に再試行してください。` },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } },
    );
  }

  const outcome = await refreshMergedDataset(dataset.id);
  // 適用しなかった理由によって、クライアントが区別できるよう状態コードを分ける。
  const status = outcome.applied
    ? 200
    : outcome.reason === "key_missing" || outcome.reason === "read_failed"
      ? 422
      : outcome.reason === "too_large"
        ? 413
        : 200;
  return NextResponse.json({ ok: true, ...outcome }, { status });
}
