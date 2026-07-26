import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";

/**
 * DELETE /api/keys/{id}
 * API キーを失効(revokedAt を設定)。物理削除はしない。
 */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "認証が必要です。" }, { status: 401 });
  }

  const { id } = await params;
  const key = await prisma.apiKey.findUnique({ where: { id } });
  if (!key || key.userId !== user.id) {
    return NextResponse.json(
      { error: "APIキーが見つかりません。" },
      { status: 404 },
    );
  }

  if (key.revokedAt !== null) {
    return NextResponse.json({ ok: true, alreadyRevoked: true });
  }

  const updated = await prisma.apiKey.update({
    where: { id },
    data: { revokedAt: new Date() },
  });

  return NextResponse.json({
    ok: true,
    id: updated.id,
    revokedAt: updated.revokedAt?.toISOString() ?? null,
  });
}
