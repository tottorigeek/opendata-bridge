import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getOwnedDataset, isTrashed } from "@/lib/datasets";
import { restoreFromTrash } from "@/lib/trash";

/**
 * ゴミ箱から元に戻す(自組織のみ)。下書きに戻るので、公開するには承認のやり直しが要る。
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
  if (!isTrashed(dataset)) {
    return NextResponse.json({ error: "このデータセットはゴミ箱に入っていません。" }, { status: 409 });
  }

  await restoreFromTrash(id);
  return NextResponse.json({ ok: true });
}
