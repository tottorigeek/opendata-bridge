import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { parseRegionInput } from "@/lib/datasets";

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

  const region = parseRegionInput(
    form.get("prefecture"),
    form.get("municipality"),
  );

  await prisma.organization.update({
    where: { id: user.organizationId },
    data: {
      prefecture: region.prefecture,
      municipality: region.municipality,
    },
  });

  return NextResponse.json({ ok: true, ...region });
}
