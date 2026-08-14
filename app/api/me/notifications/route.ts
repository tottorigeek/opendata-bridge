import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";

/**
 * PATCH /api/me/notifications
 * メール通知の受け取り設定を切り替える。アプリ内通知は常に作られるため、
 * ここで止まるのはメールだけ。
 */
export async function PATCH(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "ログインが必要です。" }, { status: 401 });
  }

  let body: { emailNotifications?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "リクエスト形式が不正です。" }, { status: 400 });
  }

  if (typeof body.emailNotifications !== "boolean") {
    return NextResponse.json({ error: "設定値が不正です。" }, { status: 400 });
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { emailNotifications: body.emailNotifications },
  });

  return NextResponse.json({ ok: true, emailNotifications: body.emailNotifications });
}
