import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createSession, hashPassword } from "@/lib/auth";
import {
  RATE_LIMITS,
  clientIp,
  consumeRateLimit,
  sweepRateLimits,
} from "@/lib/rate-limit";
import { issueEmailVerification } from "@/lib/verification";

type OrgType = "GOVERNMENT" | "PRIVATE";

export async function POST(request: Request) {
  let body: {
    organizationName?: string;
    orgType?: string;
    name?: string;
    email?: string;
    password?: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "リクエスト形式が不正です。" }, { status: 400 });
  }

  const organizationName = body.organizationName?.trim();
  const orgType = body.orgType;
  const name = body.name?.trim();
  const email = body.email?.trim().toLowerCase();
  const password = body.password ?? "";

  if (!organizationName || !name || !email || !password) {
    return NextResponse.json(
      { error: "すべての項目を入力してください。" },
      { status: 400 },
    );
  }
  if (orgType !== "GOVERNMENT" && orgType !== "PRIVATE") {
    return NextResponse.json({ error: "組織種別が不正です。" }, { status: 400 });
  }
  if (password.length < 8) {
    return NextResponse.json(
      { error: "パスワードは8文字以上で設定してください。" },
      { status: 400 },
    );
  }

  // 組織の大量作成(特に行政を騙る組織)を抑止する。
  const limit = await consumeRateLimit(
    `signup:ip:${clientIp(request)}`,
    RATE_LIMITS.signup,
  );
  if (!limit.ok) {
    return NextResponse.json(
      {
        error: `登録の試行が多すぎます。${limit.retryAfterSeconds} 秒後に再試行してください。`,
      },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } },
    );
  }
  await sweepRateLimits();

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    return NextResponse.json(
      { error: "このメールアドレスは既に登録されています。" },
      { status: 409 },
    );
  }

  const passwordHash = await hashPassword(password);

  // 組織を新規作成し、その ADMIN として登録者を作成する。
  // orgType はあくまで自己申告なので verified は必ず false から始める。
  // 「行政」を名乗るだけで公的機関として信用されないよう、
  // カタログ側は verified を見てバッジ表示を出し分ける。
  const user = await prisma.$transaction(async (tx) => {
    const org = await tx.organization.create({
      data: {
        name: organizationName,
        type: orgType as OrgType,
        verified: false,
      },
    });
    return tx.user.create({
      data: {
        email,
        passwordHash,
        name,
        role: "ADMIN",
        organizationId: org.id,
      },
    });
  });

  await createSession(user.id);

  // 確認メールを送る。送信基盤が未設定の環境ではログ出力に切り替わるため、
  // ここで失敗しても登録自体は成立させる(後からダッシュボードで再送できる)。
  try {
    await issueEmailVerification(user.id, user.email);
  } catch (e) {
    console.error("[signup] 確認メールの送信に失敗しました", e);
  }

  return NextResponse.json({ ok: true });
}
