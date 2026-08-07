import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import {
  apiKeyPrefix,
  generateApiKey,
  hashApiKey,
  maskApiKey,
} from "@/lib/api-auth";

/**
 * GET /api/keys
 * ログイン中ユーザーの API キー一覧(マスク済み)+ 利用量サマリー。
 */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "認証が必要です。" }, { status: 401 });
  }

  const keys = await prisma.apiKey.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
  });

  const totalCalls = keys.reduce((sum, k) => sum + k.callCount, 0);

  return NextResponse.json({
    keys: keys.map((k) => ({
      id: k.id,
      label: k.label,
      maskedKey: maskApiKey(k.keyPrefix),
      callCount: k.callCount,
      revoked: k.revokedAt !== null,
      createdAt: k.createdAt.toISOString(),
      revokedAt: k.revokedAt ? k.revokedAt.toISOString() : null,
    })),
    usage: {
      totalCalls,
      activeKeys: keys.filter((k) => k.revokedAt === null).length,
      totalKeys: keys.length,
    },
  });
}

/**
 * POST /api/keys { label }
 * 新規 API キーを発行。**この応答でのみ全文(key)を返す**。
 */
export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "認証が必要です。" }, { status: 401 });
  }

  let body: { label?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "リクエスト形式が不正です。" },
      { status: 400 },
    );
  }

  const label = body.label?.trim();
  if (!label) {
    return NextResponse.json(
      { error: "ラベルを入力してください。" },
      { status: 400 },
    );
  }

  // 全文はここでしか存在しない。DB にはハッシュと表示用プレフィックスだけを保存し、
  // 平文はこのレスポンスで返したあと破棄する(DB が漏れてもキーは復元できない)。
  const key = generateApiKey();
  const created = await prisma.apiKey.create({
    data: {
      keyHash: hashApiKey(key),
      keyPrefix: apiKeyPrefix(key),
      label,
      userId: user.id,
    },
  });

  return NextResponse.json(
    {
      id: created.id,
      label: created.label,
      // 発行直後のみ全文を返す(以降は取得不可)。
      key,
      callCount: created.callCount,
      createdAt: created.createdAt.toISOString(),
    },
    { status: 201 },
  );
}
