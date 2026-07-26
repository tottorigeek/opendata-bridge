import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { getOwnedDataset } from "@/lib/datasets";

/**
 * 承認 / 差し戻し。ADMIN のみ。PENDING_REVIEW を PUBLISHED または REJECTED にする。
 * body: { decision: "approve" | "reject" }
 */
export async function POST(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "ログインが必要です。" }, { status: 401 });
  }
  if (user.role !== "ADMIN") {
    return NextResponse.json(
      { error: "承認・差し戻しは組織の ADMIN のみ可能です。" },
      { status: 403 },
    );
  }

  const { id } = await ctx.params;
  const dataset = await getOwnedDataset(id, user);
  if (!dataset) {
    return NextResponse.json(
      { error: "データセットが見つからないか、操作権限がありません。" },
      { status: 404 },
    );
  }
  if (dataset.status !== "PENDING_REVIEW") {
    return NextResponse.json(
      { error: "承認待ちのデータセットのみ処理できます。" },
      { status: 409 },
    );
  }

  let body: { decision?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "リクエスト形式が不正です。" }, { status: 400 });
  }

  if (body.decision === "approve") {
    await prisma.dataset.update({
      where: { id },
      data: { status: "PUBLISHED" },
    });
    return NextResponse.json({ ok: true, status: "PUBLISHED" });
  }
  if (body.decision === "reject") {
    await prisma.dataset.update({
      where: { id },
      data: { status: "REJECTED" },
    });
    return NextResponse.json({ ok: true, status: "REJECTED" });
  }

  return NextResponse.json({ error: "decision が不正です。" }, { status: 400 });
}
