import "server-only";
import { randomBytes } from "node:crypto";
import type { Organization, User } from "@prisma/client";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/** 公開 API キーのプレフィックス。 */
export const API_KEY_PREFIX = "odb_";

/** マスク表示で残す先頭文字数(プレフィックス + 4 文字)。 */
const KEY_VISIBLE_PREFIX_LENGTH = API_KEY_PREFIX.length + 4;

const KEY_ALPHABET =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

/**
 * `odb_` + ランダム 32 文字の API キーを生成する。
 * crypto.randomBytes を使い、モジュロ偏りを避けるため 256 の倍数境界で棄却サンプリングする。
 */
export function generateApiKey(): string {
  const chars: string[] = [];
  const max = 256 - (256 % KEY_ALPHABET.length); // 偏り回避のしきい値
  while (chars.length < 32) {
    const buf = randomBytes(64);
    for (let i = 0; i < buf.length && chars.length < 32; i++) {
      const b = buf[i];
      if (b < max) chars.push(KEY_ALPHABET[b % KEY_ALPHABET.length]);
    }
  }
  return API_KEY_PREFIX + chars.join("");
}

/**
 * API キー全文を「先頭8文字 + マスク」に変換する(発行後の一覧表示用)。
 * 例: odb_ABCD**********************
 */
export function maskApiKey(key: string): string {
  if (key.length <= KEY_VISIBLE_PREFIX_LENGTH) return key;
  const head = key.slice(0, KEY_VISIBLE_PREFIX_LENGTH);
  return head + "*".repeat(Math.max(0, key.length - KEY_VISIBLE_PREFIX_LENGTH));
}

/** 認証済みユーザー + 所属組織の型(セッションと同形)。 */
export type ApiKeyUser = User & { organization: Organization };

export type ApiAuthResult =
  | { ok: true; user: ApiKeyUser; apiKeyId: string }
  | { ok: false; response: NextResponse };

/** 統一エラー形式 `{ error: { code, message } }` を返す。 */
export function apiError(
  status: number,
  code: string,
  message: string,
): NextResponse {
  return NextResponse.json({ error: { code, message } }, { status });
}

/** Authorization ヘッダから Bearer トークンを取り出す(なければ null)。 */
function extractBearerToken(request: Request): string | null {
  const header = request.headers.get("authorization");
  if (!header) return null;
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  if (!match) return null;
  const token = match[1].trim();
  return token.length > 0 ? token : null;
}

/**
 * Bearer API キーを検証する。
 * - キーの存在・未失効を確認
 * - 該当キーの callCount をインクリメント
 * - 認証済みユーザー(+所属組織)と apiKeyId を返す
 *
 * 失敗時は 401 の統一エラーレスポンスを `response` として返す。
 */
export async function authenticateApiKey(
  request: Request,
): Promise<ApiAuthResult> {
  const token = extractBearerToken(request);
  if (!token) {
    return {
      ok: false,
      response: apiError(
        401,
        "unauthorized",
        "Authorization: Bearer <api key> ヘッダが必要です。",
      ),
    };
  }

  const apiKey = await prisma.apiKey.findUnique({
    where: { key: token },
    include: { user: { include: { organization: true } } },
  });

  if (!apiKey || apiKey.revokedAt !== null) {
    return {
      ok: false,
      response: apiError(
        401,
        "invalid_api_key",
        "API キーが無効か、失効しています。",
      ),
    };
  }

  // 利用量計測: 呼び出しごとに callCount をインクリメント。
  await prisma.apiKey.update({
    where: { id: apiKey.id },
    data: { callCount: { increment: 1 } },
  });

  return { ok: true, user: apiKey.user, apiKeyId: apiKey.id };
}
