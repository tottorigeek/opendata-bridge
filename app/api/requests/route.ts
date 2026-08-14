import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { RATE_LIMITS, consumeRateLimit } from "@/lib/rate-limit";
import { REQUEST_KINDS, canSendRequest } from "@/lib/requests";

const MAX_TITLE = 200;
const MAX_BODY = 5000;

/**
 * POST /api/requests
 * 組織へデータリクエスト(公開依頼 / 修正依頼)を送る。
 */
export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "ログインが必要です。" }, { status: 401 });
  }

  let body: {
    organizationId?: string;
    datasetId?: string | null;
    kind?: string;
    title?: string;
    body?: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "リクエスト形式が不正です。" }, { status: 400 });
  }

  const organizationId = body.organizationId?.trim() ?? "";
  const kind = body.kind ?? "";
  const title = body.title?.trim() ?? "";
  const text = body.body?.trim() ?? "";

  if (!organizationId) {
    return NextResponse.json({ error: "宛先の組織が不正です。" }, { status: 400 });
  }
  if (!(REQUEST_KINDS as readonly string[]).includes(kind)) {
    return NextResponse.json({ error: "リクエスト種別が不正です。" }, { status: 400 });
  }
  if (!title || !text) {
    return NextResponse.json(
      { error: "件名と内容を入力してください。" },
      { status: 400 },
    );
  }
  if (title.length > MAX_TITLE || text.length > MAX_BODY) {
    return NextResponse.json(
      { error: `件名は ${MAX_TITLE} 文字、内容は ${MAX_BODY} 文字までです。` },
      { status: 400 },
    );
  }

  const organization = await prisma.organization.findUnique({
    where: { id: organizationId },
  });
  if (!organization) {
    return NextResponse.json({ error: "宛先の組織が見つかりません。" }, { status: 404 });
  }

  // 受付範囲(組織ごとの設定)と本人確認の状態で判定する。
  const eligibility = canSendRequest(user, organization);
  if (!eligibility.allowed) {
    return NextResponse.json({ error: eligibility.reason }, { status: 403 });
  }

  // 大量送信を抑止する。
  const limit = await consumeRateLimit(`request:${user.id}`, RATE_LIMITS.dataRequest);
  if (!limit.ok) {
    return NextResponse.json(
      {
        error: `リクエストの送信が多すぎます。${limit.retryAfterSeconds} 秒後に再試行してください。`,
      },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } },
    );
  }

  // 修正依頼の対象データセットは、宛先組織のものに限る。
  let datasetId: string | null = null;
  if (body.datasetId) {
    const dataset = await prisma.dataset.findUnique({
      where: { id: body.datasetId },
      select: { id: true, organizationId: true },
    });
    if (!dataset || dataset.organizationId !== organizationId) {
      return NextResponse.json(
        { error: "対象データセットが宛先組織のものではありません。" },
        { status: 400 },
      );
    }
    datasetId = dataset.id;
  }

  const created = await prisma.dataRequest.create({
    data: {
      organizationId,
      datasetId,
      requesterId: user.id,
      // 退会・改名後も誰からの依頼か分かるよう、送信時点の名前を写す。
      requesterName: user.name,
      requesterOrgName: user.organization.name,
      kind: kind as "CREATE" | "FIX",
      title,
      body: text,
    },
  });

  return NextResponse.json({ ok: true, id: created.id });
}
