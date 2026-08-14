import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { RATE_LIMITS, consumeRateLimit } from "@/lib/rate-limit";
import { issueEmailVerification } from "@/lib/verification";

/**
 * POST /api/auth/verify-email
 * 確認メールを再送する。ログイン中のユーザー自身宛にのみ送れる。
 */
export async function POST() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "ログインが必要です。" }, { status: 401 });
  }
  if (user.emailVerifiedAt) {
    return NextResponse.json(
      { error: "このメールアドレスは既に確認済みです。" },
      { status: 409 },
    );
  }

  // 本システムを踏み台にした大量送信を防ぐ。
  const limit = await consumeRateLimit(
    `verify-email:${user.id}`,
    RATE_LIMITS.emailVerification,
  );
  if (!limit.ok) {
    return NextResponse.json(
      {
        error: `送信が多すぎます。${limit.retryAfterSeconds} 秒後に再試行してください。`,
      },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } },
    );
  }

  const { delivered } = await issueEmailVerification(user.id, user.email);
  return NextResponse.json({ ok: true, delivered });
}
