import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  createSession,
  verifyPassword,
  verifyPasswordDummy,
} from "@/lib/auth";
import {
  RATE_LIMITS,
  clientIp,
  consumeRateLimit,
  sweepRateLimits,
} from "@/lib/rate-limit";

/** 429 応答(Retry-After 付き)。 */
function tooManyRequests(retryAfterSeconds: number) {
  return NextResponse.json(
    {
      error: `試行回数が上限に達しました。${retryAfterSeconds} 秒後に再試行してください。`,
    },
    { status: 429, headers: { "Retry-After": String(retryAfterSeconds) } },
  );
}

export async function POST(request: Request) {
  let body: { email?: string; password?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "リクエスト形式が不正です。" }, { status: 400 });
  }

  const email = body.email?.trim().toLowerCase();
  const password = body.password ?? "";

  if (!email || !password) {
    return NextResponse.json(
      { error: "メールアドレスとパスワードを入力してください。" },
      { status: 400 },
    );
  }

  // アカウント単位(詐称できない)と IP 単位(スプレー対策)の両方で絞る。
  const [byAccount, byIp] = await Promise.all([
    consumeRateLimit(`login:${email}`, RATE_LIMITS.login),
    consumeRateLimit(`login:ip:${clientIp(request)}`, RATE_LIMITS.loginIp),
  ]);
  if (!byAccount.ok) return tooManyRequests(byAccount.retryAfterSeconds);
  if (!byIp.ok) return tooManyRequests(byIp.retryAfterSeconds);
  await sweepRateLimits();

  const user = await prisma.user.findUnique({ where: { email } });

  // ユーザー不在時も同じメッセージ・同じ計算時間にして、
  // 応答内容からも応答時間からもアカウントの存在有無が漏れないようにする。
  const passwordOk = user
    ? await verifyPassword(password, user.passwordHash)
    : await verifyPasswordDummy(password);

  if (!user || !passwordOk) {
    return NextResponse.json(
      { error: "メールアドレスまたはパスワードが正しくありません。" },
      { status: 401 },
    );
  }

  await createSession(user.id);
  return NextResponse.json({ ok: true });
}
