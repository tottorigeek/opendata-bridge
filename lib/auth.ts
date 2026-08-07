import "server-only";
import { randomUUID } from "node:crypto";
import { cookies } from "next/headers";
import { SignJWT, jwtVerify } from "jose";
import bcrypt from "bcryptjs";
import type { Organization, User } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export const SESSION_COOKIE = "odb_session";
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 7; // 7 日

/**
 * 存在しないユーザーでも bcrypt の計算コストを必ず払うためのダミーハッシュ。
 * これが無いと「ユーザー不在なら即座に返る / 実在なら約 100ms かかる」という
 * 応答時間の差でメールアドレスの登録有無を判別できてしまう。
 * 値は "*" を 10 ラウンドでハッシュしたもので、平文一致は事実上起こらない。
 */
const DUMMY_PASSWORD_HASH =
  "$2b$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy";

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

/**
 * ユーザーが存在しなかった場合でも、実在時と同じだけ bcrypt を回して捨てる。
 * 応答時間からアカウントの存在有無が漏れるのを防ぐ(常に false を返す)。
 */
export async function verifyPasswordDummy(password: string): Promise<boolean> {
  await bcrypt.compare(password, DUMMY_PASSWORD_HASH);
  return false;
}

/**
 * userId を署名付き JWT にして HttpOnly cookie に保存(ログイン確立)。
 *
 * JWT には jti を持たせ、対応する Session 行を作る。認証時にこの行を確認するため、
 * ログアウトや漏洩時にサーバー側から失効させられる(純粋なステートレス JWT だと
 * 有効期限が切れるまで止められない)。
 */
export async function createSession(userId: string): Promise<void> {
  const jti = randomUUID();
  const expiresAt = new Date(Date.now() + SESSION_MAX_AGE_SECONDS * 1000);

  await prisma.session.create({
    data: { id: jti, userId, expiresAt },
  });

  const token = await new SignJWT({ sub: userId })
    .setProtectedHeader({ alg: "HS256" })
    .setJti(jti)
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

/**
 * セッションを失効させる(ログアウト)。
 * cookie を消すだけでなく Session 行に revokedAt を立てるので、
 * 同じトークンを後から提示されても通らない。
 */
export async function destroySession(): Promise<void> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;

  if (token) {
    try {
      const { payload } = await jwtVerify(token, getSecretKey());
      if (typeof payload.jti === "string") {
        await prisma.session.updateMany({
          where: { id: payload.jti, revokedAt: null },
          data: { revokedAt: new Date() },
        });
      }
    } catch {
      // 署名切れ・改竄トークンは失効させる対象が無いので何もしない
    }
  }

  cookieStore.delete(SESSION_COOKIE);
}

/**
 * 指定ユーザーの有効なセッションをすべて失効させる。
 * パスワード変更やトークン漏洩時の全端末ログアウトに使う。
 */
export async function revokeAllUserSessions(userId: string): Promise<void> {
  await prisma.session.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

/**
 * サーバー側でセッション cookie を検証し、ログイン中の User と所属 Organization を返す。
 * 未ログイン・不正トークン・ユーザー不在・失効済みセッションの場合は null。
 * 後続フェーズはこの関数でアクセス主体を取得する。
 */
export async function getCurrentUser(): Promise<SessionUser | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  try {
    const { payload } = await jwtVerify(token, getSecretKey());
    const userId = payload.sub;
    const jti = payload.jti;
    if (typeof userId !== "string" || typeof jti !== "string") return null;

    // 署名が有効でも、失効済み・期限切れ・台帳に無いセッションは受け付けない。
    const session = await prisma.session.findUnique({ where: { id: jti } });
    if (!session) return null;
    if (session.userId !== userId) return null;
    if (session.revokedAt !== null) return null;
    if (session.expiresAt.getTime() <= Date.now()) return null;

    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { organization: true },
    });
    return user;
  } catch {
    return null;
  }
}
