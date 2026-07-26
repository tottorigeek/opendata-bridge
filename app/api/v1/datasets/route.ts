import { NextResponse, type NextRequest } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { authenticateApiKey } from "@/lib/api-auth";
import {
  datasetAccessWhere,
  parsePaging,
  serializeDataset,
} from "../_shared";

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

/**
 * GET /api/v1/datasets
 * 公開(PUBLISHED/PUBLIC)+ 自組織のデータセット一覧。
 * クエリ: q(タイトル/説明の部分一致), tag, org_type(GOVERNMENT|PRIVATE), limit, offset
 */
export async function GET(request: NextRequest) {
  const auth = await authenticateApiKey(request);
  if (!auth.ok) return auth.response;

  const { searchParams } = request.nextUrl;
  const q = searchParams.get("q")?.trim();
  const tag = searchParams.get("tag")?.trim();
  const orgType = searchParams.get("org_type")?.trim().toUpperCase();
  const { limit, offset } = parsePaging(searchParams, DEFAULT_LIMIT, MAX_LIMIT);

  const and: Prisma.DatasetWhereInput[] = [
    datasetAccessWhere(auth.user.organizationId),
  ];
  if (q) {
    and.push({
      OR: [{ title: { contains: q } }, { description: { contains: q } }],
    });
  }
  if (tag) {
    // タグはカンマ区切り文字列。部分一致で絞り込み(簡易)。
    and.push({ tags: { contains: tag } });
  }
  if (orgType === "GOVERNMENT" || orgType === "PRIVATE") {
    and.push({ organization: { is: { type: orgType } } });
  }

  const where: Prisma.DatasetWhereInput = { AND: and };

  const [total, datasets] = await Promise.all([
    prisma.dataset.count({ where }),
    prisma.dataset.findMany({
      where,
      include: { organization: true },
      orderBy: { updatedAt: "desc" },
      take: limit,
      skip: offset,
    }),
  ]);

  return NextResponse.json({
    data: datasets.map(serializeDataset),
    pagination: { total, limit, offset, count: datasets.length },
  });
}
