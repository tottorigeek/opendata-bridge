import { NextResponse, type NextRequest } from "next/server";
import { stringify } from "csv-stringify/sync";
import { authenticateApiKey, apiError } from "@/lib/api-auth";
import { sanitizeCsvRows } from "@/lib/csv";
import {
  findAccessibleDataset,
  readDatasetCsvAtVersion,
  parsePaging,
} from "../../../_shared";

const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 1000;

/**
 * GET /api/v1/datasets/{id}/data
 * データ本体。format=json|csv(デフォルト json), limit(既定100/最大1000), offset。
 * version を指定するとその版、省略すれば最新版を返す。
 * json: ヘッダーをキーにしたオブジェクト配列 + どの版を返したかの情報。
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

  const { searchParams } = request.nextUrl;
  const format = (searchParams.get("format") ?? "json").toLowerCase();
  const { limit, offset } = parsePaging(searchParams, DEFAULT_LIMIT, MAX_LIMIT);

  // version 未指定なら最新版。指定時は 1 以上の整数のみ受け付ける。
  const versionParam = searchParams.get("version");
  let versionNumber: number | null = null;
  if (versionParam !== null) {
    const parsed = Number.parseInt(versionParam, 10);
    if (!Number.isInteger(parsed) || parsed < 1) {
      return apiError(400, "invalid_version", "version は 1 以上の整数で指定してください。");
    }
    versionNumber = parsed;
  }

  const resolved = await readDatasetCsvAtVersion(dataset, versionNumber);
  if (!resolved) {
    return apiError(
      404,
      "data_not_available",
      versionNumber === null
        ? "このデータセットにはデータ本体が登録されていません。"
        : `第 ${versionNumber} 版は存在しません。`,
    );
  }
  const { csv, version } = resolved;

  const total = csv.rows.length;
  const sliced = csv.rows.slice(offset, offset + limit);

  if (format === "csv") {
    // Excel で開かれる前提の形式なので数式インジェクション対策を通す。
    const body = stringify(sanitizeCsvRows([csv.header, ...sliced]));
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
    // どの版を返したかを明示する。取り込み側はこれを記録しておけば、
    // 同じ内容を ?version=N で取り直せる。
    version,
    columns: csv.header,
    data: rows,
    pagination: { total, limit, offset, count: rows.length },
  });
}
