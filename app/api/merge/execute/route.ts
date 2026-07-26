import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import {
  getAccessibleDataset,
  readDatasetTable,
  buildMergedCsv,
} from "@/lib/merge/datasets";
import { mergeTables } from "@/lib/merge/engine";
import { parseMergeRequest } from "@/lib/merge/request";
import { prisma } from "@/lib/prisma";
import { saveDatasetCsv, datasetStorageKey } from "@/lib/storage";

const JOIN_LABEL: Record<string, string> = {
  inner: "内部結合",
  left: "左外部結合",
  full: "完全外部結合",
};

/**
 * POST /api/merge/execute
 * 全行でマージを実行し、結果を新しい Dataset(MERGED / DRAFT / PRIVATE)として自組織に保存する。
 */
export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "認証が必要です。" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "リクエスト形式が不正です。" }, { status: 400 });
  }

  const parsed = parseMergeRequest(body);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }
  const req = parsed.value;

  const [dsA, dsB] = await Promise.all([
    getAccessibleDataset(user, req.datasetAId),
    getAccessibleDataset(user, req.datasetBId),
  ]);
  if (!dsA || !dsB) {
    return NextResponse.json(
      { error: "指定されたデータセットにアクセスできません。" },
      { status: 403 },
    );
  }

  let tableA;
  let tableB;
  try {
    [tableA, tableB] = await Promise.all([readDatasetTable(dsA), readDatasetTable(dsB)]);
  } catch (e) {
    const message = e instanceof Error ? e.message : "CSV の読み込みに失敗しました。";
    return NextResponse.json({ error: message }, { status: 422 });
  }

  if (!tableA.columns.includes(req.keyA) || !tableB.columns.includes(req.keyB)) {
    return NextResponse.json(
      { error: "指定されたキー列がデータセットに存在しません。" },
      { status: 400 },
    );
  }

  const result = mergeTables(tableA, tableB, {
    keyA: req.keyA,
    keyB: req.keyB,
    level: req.level,
    joinType: req.joinType,
    outputColumns: req.outputColumns,
    datasetNameA: dsA.title,
    datasetNameB: dsB.title,
  });

  const rowCount = result.rows.length;
  const matchPct = (result.stats.matchRate * 100).toFixed(1);
  const joinLabel = JOIN_LABEL[req.joinType] ?? req.joinType;
  const description =
    `「${dsA.title}」と「${dsB.title}」をマージ` +
    `(キー: ${req.keyA} ⇔ ${req.keyB}、正規化: ${req.level}、結合: ${joinLabel}、` +
    `マッチ率: ${matchPct}%)`;

  const title = `${dsA.title} × ${dsB.title}(マージ)`;

  // 先に Dataset 行を作り、その id をキーに CSV を保存してから filePath を確定する
  // (アップロード経路と同じ「id ベースのストレージキー」に統一する)。
  const created = await prisma.dataset.create({
    data: {
      title,
      description,
      sourceType: "MERGED",
      status: "DRAFT",
      visibility: "PRIVATE",
      filePath: null,
      columnsJson: JSON.stringify(result.columns),
      rowCount,
      organizationId: user.organizationId,
    },
  });

  await saveDatasetCsv(created.id, buildMergedCsv(result.columns, result.rows));
  await prisma.dataset.update({
    where: { id: created.id },
    data: { filePath: datasetStorageKey(created.id) },
  });

  return NextResponse.json({
    ok: true,
    datasetId: created.id,
    title: created.title,
    description: created.description,
    rowCount,
    stats: result.stats,
  });
}
