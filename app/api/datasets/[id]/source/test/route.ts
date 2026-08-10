import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { getOwnedDataset } from "@/lib/datasets";
import { encryptSecret } from "@/lib/crypto";
import { RATE_LIMITS, consumeRateLimit } from "@/lib/rate-limit";
import { SourceFetchError } from "@/lib/sources/fetch";
import { parseSourceConfig } from "@/lib/sources/request";
import { previewDataSource } from "@/lib/sources/sync";
import { SourceTransformError } from "@/lib/sources/transform";

/**
 * POST /api/datasets/{id}/source/test
 * 設定を保存せずに接続テストし、取得できる列と先頭数行を返す。
 * 設定を確定する前に「本当に欲しいデータが取れるか」を確認できるようにする。
 */
export async function POST(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "ログインが必要です。" }, { status: 401 });
  }

  const { id } = await ctx.params;
  const dataset = await getOwnedDataset(id, user);
  if (!dataset) {
    return NextResponse.json(
      { error: "データセットが見つからないか、操作権限がありません。" },
      { status: 404 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "リクエスト形式が不正です。" }, { status: 400 });
  }

  const parsed = parseSourceConfig(body);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }
  const cfg = parsed.value;

  const limit = await consumeRateLimit(
    `source-fetch:${user.organizationId}`,
    RATE_LIMITS.sourceFetch,
  );
  if (!limit.ok) {
    return NextResponse.json(
      {
        error: `接続テストが多すぎます。${limit.retryAfterSeconds} 秒後に再試行してください。`,
      },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } },
    );
  }

  // 認証値が未入力(= 変更しない)の場合は、保存済みの暗号文をそのまま使う。
  let authValueEnc = "";
  if (cfg.authType !== "NONE") {
    if (cfg.authValue !== undefined) {
      authValueEnc = encryptSecret(cfg.authValue);
    } else {
      const existing = await prisma.dataSource.findUnique({
        where: { datasetId: id },
        select: { authValueEnc: true },
      });
      authValueEnc = existing?.authValueEnc ?? "";
    }
  }

  try {
    const preview = await previewDataSource({
      id: "preview",
      datasetId: id,
      kind: cfg.kind,
      endpoint: cfg.endpoint,
      authType: cfg.authType,
      authValueEnc,
      authParamName: cfg.authParamName,
      recordsPath: cfg.recordsPath,
      fieldMapJson: JSON.stringify(cfg.fieldMap),
    });

    return NextResponse.json({ ok: true, ...preview });
  } catch (e) {
    if (e instanceof SourceFetchError || e instanceof SourceTransformError) {
      return NextResponse.json({ error: e.message }, { status: 502 });
    }
    console.error("[source/test] unexpected error", { datasetId: id, error: e });
    return NextResponse.json(
      { error: "接続テスト中に予期しないエラーが発生しました。" },
      { status: 500 },
    );
  }
}
