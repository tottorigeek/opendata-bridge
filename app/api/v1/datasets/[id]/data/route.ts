import { NextResponse, type NextRequest } from "next/server";
import { stringify } from "csv-stringify/sync";
import { authenticateApiKey, apiError } from "@/lib/api-auth";
import {
  findAccessibleDataset,
  readDatasetCsv,
  parsePaging,
} from "../../../_shared";

const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 1000;

/**
 * GET /api/v1/datasets/{id}/data
 * データ本体。format=json|csv(デフォルト json), limit(既定100/最大1000), offset。
 * json: ヘッダーをキーにしたオブジェクト配列。
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await authenticateApiKey(request);
  if (!auth.ok) return auth.response;

  const { id } = await params;
  const dataset = await findAccessibleDataset(id, auth.user.organizationId);
  if (!dataset) {
    return apiError(404, "not_found", "データセットが見つかりません。");
  }

  const csv = await readDatasetCsv(dataset);
  if (!csv) {
    return apiError(
      404,
      "data_not_available",
      "このデータセットにはデータ本体が登録されていません。",
    );
  }

  const { searchParams } = request.nextUrl;
  const format = (searchParams.get("format") ?? "json").toLowerCase();
  const { limit, offset } = parsePaging(searchParams, DEFAULT_LIMIT, MAX_LIMIT);

  const total = csv.rows.length;
  const sliced = csv.rows.slice(offset, offset + limit);

  if (format === "csv") {
    const body = stringify([csv.header, ...sliced]);
    return new NextResponse(body, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${dataset.id}.csv"`,
      },
    });
  }

  if (format !== "json") {
    return apiError(
      400,
      "invalid_format",
      "format は json または csv を指定してください。",
    );
  }

  // ヘッダーをキーにしたオブジェクト配列。
  const rows = sliced.map((row) => {
    const obj: Record<string, string> = {};
    csv.header.forEach((col, i) => {
      obj[col] = row[i] ?? "";
    });
    return obj;
  });

  return NextResponse.json({
    datasetId: dataset.id,
    columns: csv.header,
    data: rows,
    pagination: { total, limit, offset, count: rows.length },
  });
}
