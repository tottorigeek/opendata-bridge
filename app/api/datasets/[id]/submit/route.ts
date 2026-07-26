import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { getOwnedDataset } from "@/lib/datasets";

/**
 * 公開申請。DRAFT または REJECTED のデータセットを PENDING_REVIEW にする。
 * 自組織のメンバーであれば申請可能(承認は ADMIN が別途行う)。
 */
export async function POST(
  _request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "ログインが必要です。" }, { status: 401 });
  }
  const { id } = await ctx.params;
  const dataset = await getOwnedDataset(id, user);
  if (!dataset) {
    return NextResponse.json(
      { error: "データセットが見つからないか、操作権限がありません。" },
      { status: 404 },
    );
  }

  if (dataset.status !== "DRAFT" && dataset.status !== "REJECTED") {
    return NextResponse.json(
      { error: "下書き・差し戻し状態のデータセットのみ申請できます。" },
      { status: 409 },
    );
  }

  await prisma.dataset.update({
    where: { id },
    data: { status: "PENDING_REVIEW" },
  });
  return NextResponse.json({ ok: true });
}
