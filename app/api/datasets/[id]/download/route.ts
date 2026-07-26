import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { readCsvForDownload } from "@/lib/csv";

/**
 * CSV ダウンロード。
 * - 一般公開(PUBLISHED かつ PUBLIC)は誰でも可
 * - それ以外は同一組織のログインユーザーのみ(下書き・ORG_ONLY 含む)
 */
export async function GET(
  _request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const dataset = await prisma.dataset.findUnique({ where: { id } });
  if (!dataset) {
    return new Response("Not found", { status: 404 });
  }

  const user = await getCurrentUser();
  const isPublic =
    dataset.status === "PUBLISHED" && dataset.visibility === "PUBLIC";
  const isOwnerOrg = !!user && user.organizationId === dataset.organizationId;

  if (!isPublic && !isOwnerOrg) {
    return new Response("Forbidden", { status: 403 });
  }

  if (!dataset.filePath) {
    return new Response("このデータセットには CSV ファイルがありません。", {
      status: 404,
    });
  }

  const buffer = await readCsvForDownload(id);
  if (!buffer) {
    return new Response("ファイルが見つかりません。", { status: 404 });
  }

  // ファイル名(ASCII フォールバック + RFC5987 の UTF-8 名)
  const safeAscii =
    dataset.title.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_").trim() ||
    "dataset";
  const encoded = encodeURIComponent(`${dataset.title}.csv`);

  return new Response(new Uint8Array(buffer), {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${safeAscii}.csv"; filename*=UTF-8''${encoded}`,
      "Cache-Control": "no-store",
    },
  });
}
