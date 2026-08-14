import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { REQUEST_STATUSES, getVisibleRequest } from "@/lib/requests";

const MAX_BODY = 5000;

/**
 * PATCH /api/requests/[id]
 * 状態の更新(受け取った組織のみ)と、返信の投稿(双方)を行う。
 */
export async function PATCH(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "ログインが必要です。" }, { status: 401 });
  }

  const { id } = await ctx.params;
  const visible = await getVisibleRequest(id, user);
  if (!visible) {
    return NextResponse.json(
      { error: "リクエストが見つからないか、閲覧権限がありません。" },
      { status: 404 },
    );
  }

  let body: { status?: string; reply?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "リクエスト形式が不正です。" }, { status: 400 });
  }

  const reply = body.reply?.trim() ?? "";
  const status = body.status;

  if (!reply && !status) {
    return NextResponse.json(
      { error: "返信または状態のいずれかを指定してください。" },
      { status: 400 },
    );
  }
  if (reply.length > MAX_BODY) {
    return NextResponse.json(
      { error: `返信は ${MAX_BODY} 文字までです。` },
      { status: 400 },
    );
  }

  // 状態を変えられるのは受け取った組織だけ。送信者は返信のみ。
  if (status) {
    if (!visible.isRecipient) {
      return NextResponse.json(
        { error: "状態を変更できるのは受け取った組織のみです。" },
        { status: 403 },
      );
    }
    if (!(REQUEST_STATUSES as readonly string[]).includes(status)) {
      return NextResponse.json({ error: "状態が不正です。" }, { status: 400 });
    }
  }

  await prisma.$transaction(async (tx) => {
    if (reply) {
      await tx.dataRequestReply.create({
        data: {
          requestId: id,
          authorId: user.id,
          authorName: user.name,
          fromOrganization: visible.isRecipient,
          body: reply,
        },
      });
    }
    if (status) {
      await tx.dataRequest.update({
        where: { id },
        data: { status: status as "OPEN" | "IN_PROGRESS" | "RESOLVED" | "DECLINED" },
      });
    } else if (reply) {
      // 返信だけでも更新日時を進め、一覧で動きが分かるようにする。
      await tx.dataRequest.update({ where: { id }, data: { updatedAt: new Date() } });
    }
  });

  return NextResponse.json({ ok: true });
}
