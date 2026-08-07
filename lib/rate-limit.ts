import "server-only";
import { prisma } from "@/lib/prisma";

/**
 * 固定ウィンドウ方式のレート制限。
 *
 * Vercel のサーバーレス関数はインスタンスごとにメモリが独立しており、
 * プロセス内カウンタでは複数インスタンスにまたがる攻撃を止められない。
 * そのため DB(RateLimit テーブル)を唯一の集計点とし、
 * `(bucket, windowStart)` の一意制約に対する upsert + increment で数える。
 *
 * 失敗時は「通す」(fail-open)。DB 障害時に全リクエストを 429 にして
 * 可用性を落とすより、本来の処理へ進めた方が実害が小さい
 * (DB が落ちていればログインも API もどのみち失敗する)。
 */

export interface RateLimitRule {
  /** ウィンドウあたりの許容回数。 */
  limit: number;
  /** ウィンドウ長(秒)。 */
  windowSeconds: number;
}

export interface RateLimitResult {
  ok: boolean;
  limit: number;
  remaining: number;
  /** 次のウィンドウ開始までの秒数(Retry-After 用)。 */
  retryAfterSeconds: number;
}

/** 用途ごとのプリセット。 */
export const RATE_LIMITS = {
  /** ログイン試行: 同一アカウントに対する総当たりを抑止。 */
  login: { limit: 10, windowSeconds: 300 },
  /** ログイン試行: 同一 IP からのパスワードスプレー抑止。 */
  loginIp: { limit: 30, windowSeconds: 300 },
  /** 組織の大量作成を抑止。 */
  signup: { limit: 5, windowSeconds: 3600 },
  /** 公開 API: キー単位の従量上限。 */
  apiKey: { limit: 600, windowSeconds: 60 },
  /** マージ実行: 重い処理なので絞る。 */
  merge: { limit: 20, windowSeconds: 300 },
} as const satisfies Record<string, RateLimitRule>;

/** now を含む固定ウィンドウの開始時刻を求める(エポックからの切り捨て)。 */
function windowStartFor(windowSeconds: number, now: Date): Date {
  const windowMs = windowSeconds * 1000;
  return new Date(Math.floor(now.getTime() / windowMs) * windowMs);
}

/**
 * bucket のカウンタを 1 消費し、上限内かどうかを返す。
 * bucket は用途を含めた一意な文字列にする(例: `login:foo@example.com`)。
 */
export async function consumeRateLimit(
  bucket: string,
  rule: RateLimitRule,
): Promise<RateLimitResult> {
  const now = new Date();
  const windowStart = windowStartFor(rule.windowSeconds, now);
  const resetAt = new Date(windowStart.getTime() + rule.windowSeconds * 1000);
  const retryAfterSeconds = Math.max(
    1,
    Math.ceil((resetAt.getTime() - now.getTime()) / 1000),
  );

  const where = { bucket_windowStart: { bucket, windowStart } };

  let count: number;
  try {
    const row = await prisma.rateLimit.upsert({
      where,
      create: { bucket, windowStart, count: 1 },
      update: { count: { increment: 1 } },
    });
    count = row.count;
  } catch {
    // ウィンドウ最初の 1 回は同時実行で upsert の insert 同士が衝突しうる
    // (一意制約違反)。ここで諦めると総当たり中はほぼ常に fail-open になり
    // 制限が意味を成さなくなるため、既に行がある前提で increment を再試行する。
    try {
      const row = await prisma.rateLimit.update({
        where,
        data: { count: { increment: 1 } },
      });
      count = row.count;
    } catch {
      return {
        ok: true,
        limit: rule.limit,
        remaining: rule.limit,
        retryAfterSeconds,
      };
    }
  }

  return {
    ok: count <= rule.limit,
    limit: rule.limit,
    remaining: Math.max(0, rule.limit - count),
    retryAfterSeconds,
  };
}

/**
 * リクエスト元 IP を推定する。
 * Vercel は x-forwarded-for の先頭にクライアント IP を入れる。
 * ヘッダは詐称可能なので、IP 単位の制限は「補助」であり、
 * アカウント単位の制限(詐称できない)と併用する前提。
 */
export function clientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  return request.headers.get("x-real-ip")?.trim() || "unknown";
}

/**
 * 期限切れウィンドウの行を掃除する。
 * 専用のバッチを持たないため、書き込み経路から低確率で呼んで償却する。
 */
export async function sweepRateLimits(olderThanHours = 24): Promise<void> {
  if (Math.random() > 0.01) return;
  const threshold = new Date(Date.now() - olderThanHours * 3600 * 1000);
  try {
    await prisma.rateLimit.deleteMany({
      where: { windowStart: { lt: threshold } },
    });
  } catch {
    // 掃除の失敗は本処理に影響させない
  }
}
