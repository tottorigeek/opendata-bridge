import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { RATE_LIMITS, consumeRateLimit } from "@/lib/rate-limit";
import {
  DNS_TXT_NAME,
  ensureDomainToken,
  normalizeDomain,
  verifyDomainByDns,
} from "@/lib/verification";

/** 組織設定の変更と同じく、ドメイン確認は ADMIN のみが行える。 */
async function requireAdmin() {
  const user = await getCurrentUser();
  if (!user) {
    return { error: NextResponse.json({ error: "ログインが必要です。" }, { status: 401 }) };
  }
  if (user.role !== "ADMIN") {
    return {
      error: NextResponse.json(
        { error: "ドメイン確認を行えるのは組織の ADMIN のみです。" },
        { status: 403 },
      ),
    };
  }
  return { user };
}

/**
 * POST /api/organization/domain
 * 確認したいドメインを登録し、DNS TXT レコードに設定する値を返す。
 */
export async function POST(request: Request) {
  const { user, error } = await requireAdmin();
  if (error) return error;

  let body: { domain?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "リクエスト形式が不正です。" }, { status: 400 });
  }

  const domain = normalizeDomain(body.domain ?? "");
  if (!domain) {
    return NextResponse.json(
      { error: "ドメインの形式が正しくありません(例: pref.tottori.lg.jp)。" },
      { status: 400 },
    );
  }

  const token = await ensureDomainToken(user.organizationId, domain);
  return NextResponse.json({
    ok: true,
    domain,
    recordName: `${DNS_TXT_NAME}.${domain}`,
    recordValue: token,
  });
}

/**
 * PUT /api/organization/domain
 * 登録済みドメインの TXT レコードを引いて所有を確認する。
 */
export async function PUT() {
  const { user, error } = await requireAdmin();
  if (error) return error;

  const limit = await consumeRateLimit(
    `domain-verify:${user.organizationId}`,
    RATE_LIMITS.domainVerification,
  );
  if (!limit.ok) {
    return NextResponse.json(
      {
        error: `確認の試行が多すぎます。${limit.retryAfterSeconds} 秒後に再試行してください。`,
      },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } },
    );
  }

  const outcome = await verifyDomainByDns(user.organizationId);
  return NextResponse.json(outcome, { status: outcome.verified ? 200 : 422 });
}
