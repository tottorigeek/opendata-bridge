import { NextResponse, type NextRequest } from "next/server";
import { authenticateApiKey, apiError } from "@/lib/api-auth";
import {
  findAccessibleDataset,
  serializeDataset,
  latestVersionInfo,
} from "../../_shared";

/**
 * GET /api/v1/datasets/{id}
 * データセットのメタデータ詳細。権限外・不存在は 404。
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

  // 一覧では版を出さない(件数ぶんクエリが増えるため)。詳細でだけ返す。
  return NextResponse.json({
    data: { ...serializeDataset(dataset), version: await latestVersionInfo(dataset.id) },
  });
}
