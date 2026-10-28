import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getOwnedDataset, isTrashed } from "@/lib/datasets";
import { purgeDataset } from "@/lib/trash";

/**
 * ゴミ箱のデータセットを完全に削除する。組織の ADMIN のみ。
 * ゴミ箱に入っていないものは消せない(誤操作で公開中のデータを一気に消さないため)。
 */
export async function DELETE(
  _request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "ログインが必要です。" }, { status: 401 });
  }
  if (user.role !== "ADMIN") {
    return NextResponse.json(
      { error: "完全に削除できるのは組織の管理者だけです。" },
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
  if (!isTrashed(dataset)) {
    return NextResponse.json(
      { error: "完全に削除できるのはゴミ箱のデータセットだけです。先にゴミ箱に入れてください。" },
      { status: 409 },
    );
  }

  const result = await purgeDataset(id);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
