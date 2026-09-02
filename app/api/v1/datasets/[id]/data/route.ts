import { NextResponse, type NextRequest } from "next/server";
import { stringify } from "csv-stringify/sync";
import { authenticateApiKey, apiError } from "@/lib/api-auth";
import { sanitizeCsvRows } from "@/lib/csv";
import {
  findAccessibleDataset,
  readDatasetCsvAtVersion,
  parsePaging,
  datasetSource,
} from "../../../_shared";

const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 1000;

/**
 * GET /api/v1/datasets/{id}/data
 * データ本体。format=json|csv(デフォルト json), limit(既定100/最大1000), offset。
 * version を指定するとその版、省略すれば最新版を返す。
 * json: ヘッダーをキーにしたオブジェクト配列 + どの版を返したかの情報 + 出典。
 * csv: 出典は本文を汚さないよう X-Dataset-* ヘッダーで返す(値は
 *      非 ASCII を含みうるため percent-encoding)。
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

  const source = datasetSource(dataset);

  if (format === "csv") {
    // Excel で開かれる前提の形式なので数式インジェクション対策を通す。
    const body = stringify(sanitizeCsvRows([csv.header, ...sliced]));
    // CSV 本文に出典行を混ぜると列構造が壊れるためヘッダーで渡す。
    // 組織名・データセット名は日本語を含むので percent-encoding する。
    const headers: Record<string, string> = {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${dataset.id}.csv"`,
      "X-Dataset-Source-Organization": encodeURIComponent(source.organization),
      "X-Dataset-Source-Name": encodeURIComponent(source.dataset),
      "X-Dataset-License": encodeURIComponent(source.license),
      "X-Dataset-License-Unresolved": String(source.licenseUnresolved),
    };
    // 版を持たない旧データでは version が null。その場合はヘッダー自体を出さない
    // (空値を返すと「第 0 版」等と誤解されうるため)。
    if (version) headers["X-Dataset-Version"] = String(version.number);
    return new NextResponse(body, { status: 200, headers });
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
    // 帰属表示に必要な出典。本文と一緒に流すことで、複製する側が
    // メタデータを取り直さなくてもクレジットを保存できる。
    source,
    columns: csv.header,
    data: rows,
    pagination: { total, limit, offset, count: rows.length },
  });
}
