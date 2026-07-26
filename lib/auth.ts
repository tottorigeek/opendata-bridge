import "server-only";
import { cookies } from "next/headers";
import { SignJWT, jwtVerify } from "jose";
import bcrypt from "bcryptjs";
import type { Organization, User } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export const SESSION_COOKIE = "odb_session";
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 7; // 7 日

/** ダッシュボードなどで使う「ログイン中ユーザー + 所属組織」の型。 */
export type SessionUser = User & { organization: Organization };

function getSecretKey(): Uint8Array {
  const secret = process.env.SESSION_SECRET;
  if (!secret) {
    throw new Error("SESSION_SECRET is not set. .env を確認してください。");
  }
  return new TextEncoder().encode(secret);
}

/** 平文パスワードを bcrypt でハッシュ化する。 */
export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10);
}

/** 平文パスワードとハッシュを照合する。 */
export async function verifyPassword(
  password: string,
  passwordHash: string,
): Promise<boolean> {
  return bcrypt.compare(password, passwordHash);
}

/** userId を署名付き JWT にして HttpOnly cookie に保存(ログイン確立)。 */
export async function createSession(userId: string): Promise<void> {
  const token = await new SignJWT({ sub: userId })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_MAX_AGE_SECONDS}s`)
    .sign(getSecretKey());

  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
  });
}

/** セッション cookie を破棄(ログアウト)。 */
export async function destroySession(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE);
}

/**
 * サーバー側でセッション cookie を検証し、ログイン中の User と所属 Organization を返す。
 * 未ログイン・不正トークン・ユーザー不在の場合は null。
 * 後続フェーズはこの関数でアクセス主体を取得する。
 */
export async function getCurrentUser(): Promise<SessionUser | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  try {
    const { payload } = await jwtVerify(token, getSecretKey());
    const userId = payload.sub;
    if (typeof userId !== "string") return null;

    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { organization: true },
    });
    return user;
  } catch {
    return null;
  }
}
