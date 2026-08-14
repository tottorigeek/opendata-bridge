import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { markAllRead } from "@/lib/notifications";

/**
 * PATCH /api/notifications
 * 通知を既読にする。id を指定すればその 1 件、省略すれば未読すべて。
 */
export async function PATCH(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "ログインが必要です。" }, { status: 401 });
  }

  let body: { id?: string };
  try {
    body = await request.json();
  } catch {
    body = {};
  }

  if (body.id) {
    // 他人の通知を既読にできないよう、userId も条件に含める。
    const result = await prisma.notification.updateMany({
      where: { id: body.id, userId: user.id, readAt: null },
      data: { readAt: new Date() },
    });
    return NextResponse.json({ ok: true, updated: result.count });
  }

  const updated = await markAllRead(user.id);
  return NextResponse.json({ ok: true, updated });
}

/**
 * DELETE /api/notifications
 * 既読の通知をまとめて削除する。
 */
export async function DELETE() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "ログインが必要です。" }, { status: 401 });
  }

  const result = await prisma.notification.deleteMany({
    where: { userId: user.id, readAt: { not: null } },
  });
  return NextResponse.json({ ok: true, deleted: result.count });
}
