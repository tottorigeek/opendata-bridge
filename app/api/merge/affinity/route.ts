import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { buildAffinityReport, recommendKeyPairs } from "@/lib/merge/affinity";
import { getAccessibleDataset, readDatasetTable } from "@/lib/merge/datasets";
import { parseAffinityRequest } from "@/lib/merge/request";
import { RATE_LIMITS, consumeRateLimit } from "@/lib/rate-limit";

/**
 * POST /api/merge/affinity
 *
 * 2 つのデータセットの相性を診断する。マージ結果は作らないため、
 * 行数爆発の危険なく何度でも実行できる。
 *
 * - キー列と正規化レベルが指定されていれば、その設定での診断を返す
 * - 省略されていれば、キー列の組み合わせを総当たりして推薦を返す
 */
export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "認証が必要です。" }, { status: 401 });
  }

  // 行の組み立てはしないがフルスキャンは走るため、マージと同じ枠で回数を絞る。
  const limit = await consumeRateLimit(`merge:${user.id}`, RATE_LIMITS.merge);
  if (!limit.ok) {
    return NextResponse.json(
      {
        error: `相性チェックの実行が多すぎます。${limit.retryAfterSeconds} 秒後に再試行してください。`,
      },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "リクエスト形式が不正です。" }, { status: 400 });
  }

  const parsed = parseAffinityRequest(body);
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

  // 推薦モード: キー列が未指定のとき。
  if (!req.keyA || !req.keyB || !req.level) {
    return NextResponse.json({
      mode: "recommend",
      recommendations: recommendKeyPairs(tableA, tableB),
      rowsA: tableA.rows.length,
      rowsB: tableB.rows.length,
    });
  }

  if (!tableA.columns.includes(req.keyA) || !tableB.columns.includes(req.keyB)) {
    return NextResponse.json(
      { error: "指定されたキー列がデータセットに存在しません。" },
      { status: 400 },
    );
  }

  const report = buildAffinityReport(tableA, tableB, {
    keyA: req.keyA,
    keyB: req.keyB,
    level: req.level,
    kind: req.kind,
  });

  return NextResponse.json({ mode: "report", report });
}
