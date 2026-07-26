import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getAccessibleDataset, readDatasetTable } from "@/lib/merge/datasets";
import { mergeTables } from "@/lib/merge/engine";
import { parseMergeRequest } from "@/lib/merge/request";

/** プレビュー時に読み込む最大行数(両データセットとも先頭 N 行で試行)。 */
const PREVIEW_ROW_LIMIT = 100;
/** 返すサンプル結果行の上限。 */
const SAMPLE_RESULT_LIMIT = 50;

/**
 * POST /api/merge/preview
 * 先頭 100 行で結合を試行し、マッチ統計とサンプル結果を返す(保存はしない)。
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

  // 認可: 両データセットとも自組織 or PUBLISHED+PUBLIC のみ。
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

  const limitedA = { columns: tableA.columns, rows: tableA.rows.slice(0, PREVIEW_ROW_LIMIT) };
  const limitedB = { columns: tableB.columns, rows: tableB.rows.slice(0, PREVIEW_ROW_LIMIT) };

  const result = mergeTables(limitedA, limitedB, {
    keyA: req.keyA,
    keyB: req.keyB,
    level: req.level,
    joinType: req.joinType,
    outputColumns: req.outputColumns,
    datasetNameA: dsA.title,
    datasetNameB: dsB.title,
  });

  return NextResponse.json({
    columns: result.columns,
    sampleRows: result.rows.slice(0, SAMPLE_RESULT_LIMIT),
    stats: result.stats,
    previewLimit: PREVIEW_ROW_LIMIT,
    fullRowsA: tableA.rows.length,
    fullRowsB: tableB.rows.length,
  });
}
