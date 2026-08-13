import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import {
  formatTags,
  parseTags,
  isVisibility,
  parseRegionInput,
} from "@/lib/datasets";
import {
  extractCsvMeta,
  saveCsvFile,
  datasetRelativePath,
} from "@/lib/csv";

const MAX_UPLOAD_BYTES = 20 * 1024 * 1024; // 20MB

/** データセット新規作成(multipart/form-data)。CSV ファイルは任意。 */
export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "ログインが必要です。" }, { status: 401 });
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
  const region = parseRegionInput(
    form.get("prefecture"),
    form.get("municipality"),
  );

  if (!title) {
    return NextResponse.json({ error: "タイトルを入力してください。" }, { status: 400 });
  }
  if (!isVisibility(visibility)) {
    return NextResponse.json({ error: "公開範囲が不正です。" }, { status: 400 });
  }

  // CSV ファイル(任意)
  const file = form.get("file");
  let columns: string[] = [];
  let rowCount = 0;
  let buffer: Buffer | null = null;

  if (file && file instanceof File && file.size > 0) {
    if (file.size > MAX_UPLOAD_BYTES) {
      return NextResponse.json(
        { error: "CSV ファイルは 20MB 以下にしてください。" },
        { status: 400 },
      );
    }
    const name = file.name.toLowerCase();
    if (!name.endsWith(".csv")) {
      return NextResponse.json(
        { error: "CSV(.csv)ファイルを選択してください。" },
        { status: 400 },
      );
    }
    buffer = Buffer.from(await file.arrayBuffer());
    try {
      const meta = extractCsvMeta(buffer);
      columns = meta.columns;
      rowCount = meta.rowCount;
    } catch {
      return NextResponse.json(
        { error: "CSV の解析に失敗しました。ファイル形式を確認してください。" },
        { status: 400 },
      );
    }
  }

  const dataset = await prisma.dataset.create({
    data: {
      title,
      description,
      license,
      visibility,
      status: "DRAFT",
      tags: formatTags(parseTags(tagsRaw)),
      updateFrequency,
      sourceType: "UPLOADED",
      columnsJson: JSON.stringify(columns),
      rowCount,
      filePath: null,
      prefecture: region.prefecture,
      municipality: region.municipality,
      organizationId: user.organizationId,
    },
  });

  if (buffer) {
    await saveCsvFile(dataset.id, buffer);
    await prisma.dataset.update({
      where: { id: dataset.id },
      data: { filePath: datasetRelativePath(dataset.id) },
    });
  }

  return NextResponse.json({ ok: true, id: dataset.id });
}
