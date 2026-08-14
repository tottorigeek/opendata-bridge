import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { parseRegionInput } from "@/lib/datasets";
import { REQUEST_POLICIES } from "@/lib/requests";

/**
 * 組織情報の更新。現時点では所在地(都道府県 / 市区町村)のみ。
 *
 * 所在地は、データセット側に対象地域が未設定のときのカタログ絞り込みの
 * フォールバックになるため、組織の代表者(ADMIN)だけが変更できる。
 */
export async function PATCH(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "ログインが必要です。" }, { status: 401 });
  }
  if (user.role !== "ADMIN") {
    return NextResponse.json(
      { error: "組織設定を変更できるのは組織の ADMIN のみです。" },
      { status: 403 },
    );
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: "リクエスト形式が不正です。" }, { status: 400 });
  }

  // 設定画面には複数のフォームがあるため、送られてきた項目だけを更新する。
  // 所在地を送らないフォームの保存で所在地が消える、といった事故を避ける。
  const data: {
    prefecture?: string | null;
    municipality?: string | null;
    requestPolicy?: (typeof REQUEST_POLICIES)[number];
  } = {};

  if (form.has("prefecture")) {
    const region = parseRegionInput(
      form.get("prefecture"),
      form.get("municipality"),
    );
    data.prefecture = region.prefecture;
    data.municipality = region.municipality;
  }

  const policyRaw = form.get("requestPolicy");
  if (typeof policyRaw === "string") {
    if (!(REQUEST_POLICIES as readonly string[]).includes(policyRaw)) {
      return NextResponse.json({ error: "受付範囲の値が不正です。" }, { status: 400 });
    }
    data.requestPolicy = policyRaw as (typeof REQUEST_POLICIES)[number];
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "更新する項目がありません。" }, { status: 400 });
  }

  await prisma.organization.update({
    where: { id: user.organizationId },
    data,
  });

  return NextResponse.json({ ok: true, ...data });
}
