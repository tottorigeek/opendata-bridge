import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import {
  formatTags,
  parseTags,
  isVisibility,
  getOwnedDataset,
  parseRegionInput,
} from "@/lib/datasets";
import { extractCsvMeta, deleteCsvFile } from "@/lib/csv";
import { createDatasetVersion } from "@/lib/versions";

const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;

/** メタデータ更新(+任意で CSV 差し替え)。自組織のみ。 */
export async function PATCH(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "ログインが必要です。" }, { status: 401 });
  }
  const { id } = await ctx.params;
  const existing = await getOwnedDataset(id, user);
  if (!existing) {
    return NextResponse.json(
      { error: "データセットが見つからないか、操作権限がありません。" },
      { status: 404 },
    );
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: "リクエスト形式が不正です。" }, { status: 400 });
  }

  const title = String(form.get("title") ?? "").trim();
  const description = String(form.get("description") ?? "").trim();
  const license = String(form.get("license") ?? "").trim() || "CC-BY-4.0";
  const tagsRaw = String(form.get("tags") ?? "");
  const updateFrequency =
    String(form.get("updateFrequency") ?? "").trim() || "不定期";
  const visibility = String(form.get("visibility") ?? "PRIVATE");

  if (!title) {
    return NextResponse.json({ error: "タイトルを入力してください。" }, { status: 400 });
  }
  if (!isVisibility(visibility)) {
    return NextResponse.json({ error: "公開範囲が不正です。" }, { status: 400 });
  }

  // 対象地域はフォームが常に送るため、未選択は「解除」として null を書き込む。
  const region = parseRegionInput(
    form.get("prefecture"),
    form.get("municipality"),
  );

  const data: {
    title: string;
    description: string;
    license: string;
    visibility: typeof visibility;
    tags: string;
    updateFrequency: string;
    prefecture: string | null;
    municipality: string | null;
    licenseUnresolved: boolean;
    columnsJson?: string;
    rowCount?: number;
    filePath?: string;
  } = {
    title,
    description,
    license,
    visibility,
    tags: formatTags(parseTags(tagsRaw)),
    updateFrequency,
    prefecture: region.prefecture,
    municipality: region.municipality,
    // フォームはライセンスを必ず送るため、保存できた時点で人が値を確認したとみなし
    // 未確定フラグを解除する(マージ結果の未確定状態はここで解消される)。
    licenseUnresolved: false,
  };

  // CSV 差し替え(任意)。差し替えたときは版が増える。
  let newVersion: { number: number; unchanged: boolean } | null = null;
  const file = form.get("file");
  if (file && file instanceof File && file.size > 0) {
    if (file.size > MAX_UPLOAD_BYTES) {
      return NextResponse.json(
        { error: "CSV ファイルは 20MB 以下にしてください。" },
        { status: 400 },
      );
    }
    if (!file.name.toLowerCase().endsWith(".csv")) {
      return NextResponse.json(
        { error: "CSV(.csv)ファイルを選択してください。" },
        { status: 400 },
      );
    }
    const buffer = Buffer.from(await file.arrayBuffer());
    let meta;
    try {
      meta = extractCsvMeta(buffer);
    } catch {
      return NextResponse.json(
        { error: "CSV の解析に失敗しました。" },
        { status: 400 },
      );
    }
    // 差し替えは新しい版として記録する。filePath / columnsJson / rowCount の
    // 更新は createDatasetVersion が行うため、ここでは data に積まない。
    newVersion = await createDatasetVersion({
      datasetId: id,
      content: buffer,
      columns: meta.columns,
      rowCount: meta.rowCount,
      source: "UPLOAD",
      note: "CSV の差し替え",
    });
  }

  await prisma.dataset.update({ where: { id }, data });
  return NextResponse.json({
    ok: true,
    id,
    ...(newVersion ? { version: newVersion.number, versionUnchanged: newVersion.unchanged } : {}),
  });
}

/** データセット削除(ファイルも削除)。自組織のみ。 */
export async function DELETE(
  _request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "ログインが必要です。" }, { status: 401 });
  }
  const { id } = await ctx.params;
  const existing = await getOwnedDataset(id, user);
  if (!existing) {
    return NextResponse.json(
      { error: "データセットが見つからないか、操作権限がありません。" },
      { status: 404 },
    );
  }

  await prisma.dataset.delete({ where: { id } });
  await deleteCsvFile(id);
  return NextResponse.json({ ok: true });
}
