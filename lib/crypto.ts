import "server-only";
import {
  createCipheriv,
  createDecipheriv,
  hkdfSync,
  randomBytes,
} from "node:crypto";

/**
 * 保存時暗号化(AES-256-GCM)。
 *
 * 外部データソースの API キー等は、こちらから相手に提示する必要があるため
 * ハッシュ化ではなく「復号できる形」で保存せざるを得ない。そのため平文ではなく
 * 認証付き暗号で保存し、DB が漏れただけでは他システムの資格情報が使われないようにする。
 *
 * 鍵は SESSION_SECRET から HKDF で導出する(専用の環境変数を増やさないため)。
 * 用途を分けるため info に固定文字列を与えており、セッション署名鍵とは別の鍵になる。
 *
 * NOTE: SESSION_SECRET を変更すると既存の暗号文は復号できなくなる。
 *   その場合はデータソースの認証情報を再入力する必要がある(復号失敗は
 *   同期エラーとして表面化し、他のデータは影響を受けない)。
 */

const KEY_INFO = "opendata-bridge:datasource-credential:v1";
const IV_LENGTH = 12; // GCM 推奨の 96bit
const AUTH_TAG_LENGTH = 16;

function getKey(): Buffer {
  const secret = process.env.SESSION_SECRET;
  if (!secret) {
    throw new Error("SESSION_SECRET is not set. .env を確認してください。");
  }
  // salt は固定で良い(SESSION_SECRET 自体が高エントロピーな秘密であり、
  // ここでの HKDF の目的は鍵の伸長と用途分離)。
  const derived = hkdfSync(
    "sha256",
    Buffer.from(secret, "utf8"),
    Buffer.alloc(0),
    Buffer.from(KEY_INFO, "utf8"),
    32,
  );
  return Buffer.from(derived);
}

/**
 * 平文を暗号化して base64 文字列にする。
 * 出力形式: base64(iv[12] || authTag[16] || ciphertext)
 * 空文字は「未設定」を意味するのでそのまま空文字を返す。
 */
export function encryptSecret(plaintext: string): string {
  if (!plaintext) return "";
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv("aes-256-gcm", getKey(), iv);
  const ciphertext = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();
  return Buffer.concat([iv, authTag, ciphertext]).toString("base64");
}

/**
 * encryptSecret の逆。
 * 改竄・鍵不一致は GCM の認証で検出され例外になる。
 */
export function decryptSecret(encoded: string): string {
  if (!encoded) return "";
  const raw = Buffer.from(encoded, "base64");
  if (raw.length < IV_LENGTH + AUTH_TAG_LENGTH) {
    throw new Error("暗号文の形式が不正です。");
  }
  const iv = raw.subarray(0, IV_LENGTH);
  const authTag = raw.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
  const ciphertext = raw.subarray(IV_LENGTH + AUTH_TAG_LENGTH);

  const decipher = createDecipheriv("aes-256-gcm", getKey(), iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]).toString("utf8");
}
