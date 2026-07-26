import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createSession, hashPassword } from "@/lib/auth";

type OrgType = "GOVERNMENT" | "PRIVATE";

export async function POST(request: Request) {
  let body: {
    organizationName?: string;
    orgType?: string;
    name?: string;
    email?: string;
    password?: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "リクエスト形式が不正です。" }, { status: 400 });
  }

  const organizationName = body.organizationName?.trim();
  const orgType = body.orgType;
  const name = body.name?.trim();
  const email = body.email?.trim().toLowerCase();
  const password = body.password ?? "";

  if (!organizationName || !name || !email || !password) {
    return NextResponse.json(
      { error: "すべての項目を入力してください。" },
      { status: 400 },
    );
  }
  if (orgType !== "GOVERNMENT" && orgType !== "PRIVATE") {
    return NextResponse.json({ error: "組織種別が不正です。" }, { status: 400 });
  }
  if (password.length < 8) {
    return NextResponse.json(
      { error: "パスワードは8文字以上で設定してください。" },
      { status: 400 },
    );
  }

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    return NextResponse.json(
      { error: "このメールアドレスは既に登録されています。" },
      { status: 409 },
    );
  }

  const passwordHash = await hashPassword(password);

  // 組織を新規作成し、その ADMIN として登録者を作成する。
  const user = await prisma.$transaction(async (tx) => {
    const org = await tx.organization.create({
      data: { name: organizationName, type: orgType as OrgType },
    });
    return tx.user.create({
      data: {
        email,
        passwordHash,
        name,
        role: "ADMIN",
        organizationId: org.id,
      },
    });
  });

  await createSession(user.id);
  return NextResponse.json({ ok: true });
}
