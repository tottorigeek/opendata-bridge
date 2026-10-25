import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { bufferToCsvTable, readCsvForDownload, readCurrentDatasetCsv } from "@/lib/csv";
import { detectCoordinateColumns, toGeoJson } from "@/lib/geo";
import { readVersionCsv } from "@/lib/versions";

/**
 * CSV ダウンロード。
 * - 一般公開(PUBLISHED かつ PUBLIC)は誰でも可
 * - それ以外は同一組織のログインユーザーのみ(下書き・ORG_ONLY 含む)
 *
 * ?format=geojson で、緯度・経度の列から GeoJSON(FeatureCollection)を返す。
 * 座標の列が無いデータセットは 400。座標の読めない行は含めない。
 */
export async function GET(
  request: Request,
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

  // ?version=N で過去の版を取得できる。省略時は最新版(Dataset の写し)。
  const searchParams = new URL(request.url).searchParams;
  const requested = searchParams.get("version");
  const versionNumber = requested ? Number.parseInt(requested, 10) : null;
  if (requested !== null && (!Number.isInteger(versionNumber) || versionNumber! < 1)) {
    return new Response("版の指定が不正です。", { status: 400 });
  }

  const format = (searchParams.get("format") ?? "csv").toLowerCase();
  if (format !== "csv" && format !== "geojson") {
    return new Response("format は csv または geojson を指定してください。", { status: 400 });
  }

  // ファイル名(ASCII フォールバック + RFC5987 の UTF-8 名)
  const safeAscii =
    dataset.title.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_").trim() ||
    "dataset";
  const suffix = versionNumber ? `_v${versionNumber}` : "";

  if (format === "geojson") {
    // GeoJSON は表計算ソフトで開かれないので、CSV 向けの数式対策を通す前の値を使う
    const raw = versionNumber
      ? await readVersionCsv(id, versionNumber)
      : await readCurrentDatasetCsv(id);
    if (!raw) {
      return new Response("ファイルが見つかりません。", { status: 404 });
    }
    const table = bufferToCsvTable(raw);
    const cols = detectCoordinateColumns(table.columns);
    if (!cols) {
      return new Response(
        "このデータセットには緯度・経度の列がないため、GeoJSON にできません。",
        { status: 400 },
      );
    }
    const encodedGeo = encodeURIComponent(`${dataset.title}${suffix}.geojson`);
    return new Response(JSON.stringify(toGeoJson(table.columns, table.rows, cols)), {
      status: 200,
      headers: {
        "Content-Type": "application/geo+json; charset=utf-8",
        "Content-Disposition": `attachment; filename="${safeAscii}${suffix}.geojson"; filename*=UTF-8''${encodedGeo}`,
        "Cache-Control": "no-store",
      },
    });
  }

  const buffer = versionNumber
    ? await readVersionCsv(id, versionNumber)
    : await readCsvForDownload(id);
  if (!buffer) {
    return new Response("ファイルが見つかりません。", { status: 404 });
  }

  const encoded = encodeURIComponent(`${dataset.title}${suffix}.csv`);

  return new Response(new Uint8Array(buffer), {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${safeAscii}${suffix}.csv"; filename*=UTF-8''${encoded}`,
      "Cache-Control": "no-store",
    },
  });
}
