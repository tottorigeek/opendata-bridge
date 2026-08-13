import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { getOwnedDataset } from "@/lib/datasets";
import { encryptSecret } from "@/lib/crypto";
import { parseSourceConfig } from "@/lib/sources/request";

/**
 * データセットに外部データソースを関連付ける / 解除する。
 * いずれも自組織のデータセットのみ操作できる。
 */

/** 設定の保存(新規作成 or 更新)。 */
export async function PUT(
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

  const existing = await prisma.dataSource.findUnique({
    where: { datasetId: id },
  });

  // authValue 未指定は「変更しない」。認証方式を NONE にしたときは値も破棄する。
  let authValueEnc: string | undefined;
  if (cfg.authType === "NONE") {
    authValueEnc = "";
  } else if (cfg.authValue !== undefined) {
    authValueEnc = encryptSecret(cfg.authValue);
  }

  const common = {
    kind: cfg.kind,
    endpoint: cfg.endpoint,
    authType: cfg.authType,
    authParamName: cfg.authParamName,
    recordsPath: cfg.recordsPath,
    fieldMapJson: JSON.stringify(cfg.fieldMap),
    syncMode: cfg.syncMode,
  };

  await prisma.$transaction(async (tx) => {
    if (existing) {
      await tx.dataSource.update({
        where: { datasetId: id },
        data: {
          ...common,
          ...(authValueEnc !== undefined ? { authValueEnc } : {}),
        },
      });
    } else {
      await tx.dataSource.create({
        data: {
          datasetId: id,
          ...common,
          authValueEnc: authValueEnc ?? "",
        },
      });
    }

    // 取り込み由来であることを一覧・カタログで判別できるようにする。
    // マージ結果(MERGED)は由来を保ちたいので上書きしない。
    if (dataset.sourceType === "UPLOADED") {
      await tx.dataset.update({
        where: { id },
        data: { sourceType: "API" },
      });
    }
  });

  return NextResponse.json({ ok: true });
}

/** 関連付けの解除。取り込み済みの CSV とデータセット自体は残す。 */
export async function DELETE(
  _request: Request,
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

  const existing = await prisma.dataSource.findUnique({
    where: { datasetId: id },
  });
  if (!existing) {
    return NextResponse.json(
      { error: "このデータセットにはデータソースが設定されていません。" },
      { status: 404 },
    );
  }

  await prisma.$transaction(async (tx) => {
    // SyncRun は onDelete: Cascade で一緒に消える。
    await tx.dataSource.delete({ where: { datasetId: id } });
    // 以降は手動管理のデータセットとして扱う(取り込み済み CSV はそのまま使える)。
    if (dataset.sourceType === "API") {
      await tx.dataset.update({
        where: { id },
        data: { sourceType: "UPLOADED" },
      });
    }
  });

  return NextResponse.json({ ok: true });
}
