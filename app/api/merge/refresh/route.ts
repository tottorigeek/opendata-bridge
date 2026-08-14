import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { getOwnedDataset } from "@/lib/datasets";
import {
  DEFAULT_MAX_OUTPUT_ROWS,
  MergeLimitExceededError,
  joinTypeForKind,
  mergeTables,
  type MergeKind,
} from "@/lib/merge/engine";
import { getAccessibleDataset, readDatasetSource, buildMergedCsv } from "@/lib/merge/datasets";
import { evaluateGate, parseAnalysis } from "@/lib/merge/refresh";
import { RATE_LIMITS, consumeRateLimit } from "@/lib/rate-limit";
import { createDatasetVersion, latestVersion } from "@/lib/versions";
import { notify } from "@/lib/notifications";
import type { NormalizationLevel } from "@/lib/merge/normalize";

/**
 * PATCH /api/merge/refresh
 * ピン留め / latest を切り替える。
 */
export async function PATCH(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "ログインが必要です。" }, { status: 401 });
  }

  let body: { datasetId?: string; followLatest?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "リクエスト形式が不正です。" }, { status: 400 });
  }
  if (typeof body.followLatest !== "boolean" || !body.datasetId) {
    return NextResponse.json({ error: "設定値が不正です。" }, { status: 400 });
  }

  const dataset = await getOwnedDataset(body.datasetId, user);
  if (!dataset) {
    return NextResponse.json(
      { error: "データセットが見つからないか、操作権限がありません。" },
      { status: 404 },
    );
  }

  await prisma.mergeLineage.update({
    where: { datasetId: dataset.id },
    data: { followLatest: body.followLatest },
  });
  return NextResponse.json({ ok: true, followLatest: body.followLatest });
}

/**
 * POST /api/merge/refresh
 * 記録済みのマージ設定で作り直す。品質ゲートを通らなければ適用しない。
 */
export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "ログインが必要です。" }, { status: 401 });
  }

  let body: { datasetId?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "リクエスト形式が不正です。" }, { status: 400 });
  }
  if (!body.datasetId) {
    return NextResponse.json({ error: "データセットが不正です。" }, { status: 400 });
  }

  const dataset = await getOwnedDataset(body.datasetId, user);
  if (!dataset) {
    return NextResponse.json(
      { error: "データセットが見つからないか、操作権限がありません。" },
      { status: 404 },
    );
  }

  const limit = await consumeRateLimit(`merge:${user.id}`, RATE_LIMITS.merge);
  if (!limit.ok) {
    return NextResponse.json(
      { error: `実行が多すぎます。${limit.retryAfterSeconds} 秒後に再試行してください。` },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } },
    );
  }

  const lineage = await prisma.mergeLineage.findUnique({
    where: { datasetId: dataset.id },
    include: { inputs: { orderBy: { side: "asc" } } },
  });
  if (!lineage) {
    return NextResponse.json(
      { error: "このデータセットにはマージの来歴がありません。" },
      { status: 404 },
    );
  }

  const inputA = lineage.inputs.find((i) => i.side === "A");
  const inputB = lineage.inputs.find((i) => i.side === "B");
  if (!inputA?.datasetId || !inputB?.datasetId) {
    return NextResponse.json(
      { error: "出典のデータセットが削除されているため、作り直せません。" },
      { status: 409 },
    );
  }

  const [dsA, dsB] = await Promise.all([
    getAccessibleDataset(user, inputA.datasetId),
    getAccessibleDataset(user, inputB.datasetId),
  ]);
  if (!dsA || !dsB) {
    return NextResponse.json(
      { error: "出典のデータセットにアクセスできなくなっています。" },
      { status: 403 },
    );
  }

  let sourceA;
  let sourceB;
  try {
    [sourceA, sourceB] = await Promise.all([
      readDatasetSource(dsA),
      readDatasetSource(dsB),
    ]);
  } catch (e) {
    const message = e instanceof Error ? e.message : "CSV の読み込みに失敗しました。";
    return NextResponse.json({ error: message }, { status: 422 });
  }

  // 事前検証: キー列が新しい版にも存在するか。閾値以前の問題なのでここで弾く。
  if (
    !sourceA.table.columns.includes(lineage.keyA) ||
    !sourceB.table.columns.includes(lineage.keyB)
  ) {
    const message =
      `出典のキー列(${lineage.keyA} / ${lineage.keyB})が見つからなくなったため、` +
      `作り直しを中止しました。列名の変更を確認してください。`;
    await prisma.mergeLineage.update({
      where: { datasetId: dataset.id },
      data: { lastRefreshMessage: message },
    });
    return NextResponse.json({ ok: false, applied: false, message }, { status: 422 });
  }

  let result;
  try {
    result = mergeTables(sourceA.table, sourceB.table, {
      keyA: lineage.keyA,
      keyB: lineage.keyB,
      level: lineage.level as NormalizationLevel,
      joinType: joinTypeForKind(lineage.kind as MergeKind),
      datasetNameA: dsA.title,
      datasetNameB: dsB.title,
      maxOutputRows: DEFAULT_MAX_OUTPUT_ROWS,
    });
  } catch (e) {
    if (e instanceof MergeLimitExceededError) {
      return NextResponse.json({ ok: false, applied: false, message: e.message }, { status: 413 });
    }
    throw e;
  }

  // 品質ゲート。前回値と初回値の両方と比べ、いずれかで大きく落ちていれば止める。
  const verdict = evaluateGate(
    parseAnalysis(lineage.baselineStatsJson),
    parseAnalysis(lineage.statsJson),
    result.stats.analysis,
  );

  if (!verdict.pass) {
    // 適用せず据え置く。所有者には通知して気づけるようにする。
    await prisma.mergeLineage.update({
      where: { datasetId: dataset.id },
      data: { lastRefreshMessage: verdict.message },
    });
    await notify({
      userIds: (
        await prisma.user.findMany({
          where: { organizationId: dataset.organizationId },
          select: { id: true },
        })
      ).map((u) => u.id),
      type: "REQUEST_STATUS_CHANGED",
      title: `自動更新を止めました: ${dataset.title}`,
      body: verdict.message,
      link: `/dashboard/datasets/${dataset.id}`,
    });
    return NextResponse.json({ ok: true, applied: false, message: verdict.message });
  }

  await createDatasetVersion({
    datasetId: dataset.id,
    content: buildMergedCsv(result.columns, result.rows),
    columns: result.columns,
    rowCount: result.rows.length,
    source: "MERGE",
    note: "出典の更新に伴う作り直し",
  });

  const [versionA, versionB] = await Promise.all([
    latestVersion(dsA.id),
    latestVersion(dsB.id),
  ]);

  await prisma.$transaction([
    prisma.mergeLineage.update({
      where: { datasetId: dataset.id },
      data: {
        statsJson: JSON.stringify(result.stats.analysis),
        columnOriginsJson: JSON.stringify(result.columnOrigins),
        refreshedAt: new Date(),
        lastRefreshMessage: verdict.message,
      },
    }),
    prisma.mergeLineageInput.update({
      where: { id: inputA.id },
      data: { versionNumber: versionA?.number ?? null, contentHash: sourceA.contentHash },
    }),
    prisma.mergeLineageInput.update({
      where: { id: inputB.id },
      data: { versionNumber: versionB?.number ?? null, contentHash: sourceB.contentHash },
    }),
  ]);

  return NextResponse.json({
    ok: true,
    applied: true,
    message: verdict.message,
    rowCount: result.rows.length,
  });
}
