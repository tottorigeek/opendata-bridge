import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { promises as dns } from "node:dns";
import type { Organization } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { appBaseUrl, sendMail } from "@/lib/mail";

/**
 * 本人確認。
 *
 * 方針は「個人情報を保存せずに、必要な保証だけを得る」こと。
 * この製品が必要としているのは「この人は誰か」ではなく
 * 「この人は本当にその組織の人か」なので、公的身分証は扱わず、
 * メールアドレスの到達確認とドメインの管理権限で証明する。
 *
 * 特に行政については .lg.jp が強い証明になる。日本の地方公共団体しか
 * 取得できないドメインであり、個人情報を一切保持せずに
 * 「その自治体の関係者である」ことを示せる。
 */

/** メール確認トークンの有効期間。 */
const EMAIL_TOKEN_TTL_MS = 24 * 60 * 60 * 1000;

/** DNS TXT レコードの名前。ドメイン所有の確認に使う。 */
export const DNS_TXT_NAME = "_opendata-bridge";

/**
 * 行政組織として自動で確認できるドメインの接尾辞。
 *
 * .lg.jp は地方公共団体、.go.jp は国の機関しか取得できない。
 * これ以外の独自ドメインは、所有を証明できても「行政である」ことの
 * 証明にはならないため、行政バッジは付けない(運営の手動確認に委ねる)。
 */
const GOVERNMENT_DOMAIN_SUFFIXES = [".lg.jp", ".go.jp"];

export function isGovernmentDomain(domain: string): boolean {
  const d = domain.toLowerCase();
  return GOVERNMENT_DOMAIN_SUFFIXES.some((suffix) => d.endsWith(suffix));
}

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** メールアドレスからドメイン部分を取り出す(小文字化)。 */
export function domainOfEmail(email: string): string {
  const at = email.lastIndexOf("@");
  return at === -1 ? "" : email.slice(at + 1).toLowerCase();
}

/** 入力されたドメイン文字列を正規化する。不正なら null。 */
export function normalizeDomain(input: string): string | null {
  const value = input
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/\/.*$/, "")
    .replace(/\.$/, "");
  if (!value) return null;
  // ラベルは英数字とハイフン、最低 1 つのドットを要求する。
  if (!/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(value)) return null;
  return value;
}

// ---------------------------------------------------------------------------
// メールアドレスの確認
// ---------------------------------------------------------------------------

/**
 * 確認メールを発行して送信する。
 *
 * 既存の未使用トークンは無効化してから作り直す(リンクの多重発行を避ける)。
 * 送信プロバイダが未設定の環境では lib/mail.ts がログ出力に切り替わるため、
 * 戻り値の url を使えば開発中も確認フローを完了できる。
 */
export async function issueEmailVerification(userId: string, email: string) {
  const token = randomBytes(32).toString("base64url");

  await prisma.emailVerification.updateMany({
    where: { userId, consumedAt: null },
    data: { consumedAt: new Date() },
  });

  await prisma.emailVerification.create({
    data: {
      tokenHash: hashToken(token),
      userId,
      email,
      expiresAt: new Date(Date.now() + EMAIL_TOKEN_TTL_MS),
    },
  });

  const url = `${appBaseUrl()}/verify-email?token=${token}`;
  const result = await sendMail({
    to: email,
    subject: "[OpenData Bridge] メールアドレスの確認",
    text: [
      "OpenData Bridge へのご登録ありがとうございます。",
      "",
      "以下のリンクを開いて、メールアドレスの確認を完了してください。",
      url,
      "",
      "このリンクは 24 時間で失効します。",
      "心当たりがない場合は、このメールを破棄してください。",
    ].join("\n"),
  });

  return { url, delivered: result.delivered };
}

export type EmailVerificationResult =
  | { ok: true; alreadyVerified: boolean }
  | { ok: false; reason: "invalid" | "expired" | "used" | "email_changed" };

/** 確認リンクのトークンを検証し、確認済みにする。 */
export async function consumeEmailVerification(
  token: string,
): Promise<EmailVerificationResult> {
  if (!token) return { ok: false, reason: "invalid" };

  const record = await prisma.emailVerification.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { user: true },
  });
  if (!record) return { ok: false, reason: "invalid" };
  // メールのセキュリティスキャナがリンクを先読みしてトークンを消費することがある。
  // その場合でも確認自体は成立しているので、本人が開いたときは成功として扱う。
  if (record.consumedAt) {
    return record.user.emailVerifiedAt
      ? { ok: true, alreadyVerified: true }
      : { ok: false, reason: "used" };
  }
  if (record.expiresAt.getTime() < Date.now()) return { ok: false, reason: "expired" };
  // 発行後にメールアドレスを変更した場合、古い宛先宛のリンクは通さない。
  if (record.user.email !== record.email) {
    return { ok: false, reason: "email_changed" };
  }

  const alreadyVerified = record.user.emailVerifiedAt !== null;

  await prisma.$transaction([
    prisma.emailVerification.update({
      where: { id: record.id },
      data: { consumedAt: new Date() },
    }),
    prisma.user.update({
      where: { id: record.userId },
      data: { emailVerifiedAt: record.user.emailVerifiedAt ?? new Date() },
    }),
  ]);

  // メール確認が済むと、そのドメインを根拠に組織確認が通ることがある。
  await tryVerifyOrganizationByEmailDomain(record.userId);

  return { ok: true, alreadyVerified };
}

// ---------------------------------------------------------------------------
// 組織のドメイン確認
// ---------------------------------------------------------------------------

export interface DomainVerificationOutcome {
  verified: boolean;
  /** 組織種別のバッジ(verified)まで付与できたか。 */
  badgeGranted: boolean;
  message: string;
}

/**
 * 確認済みドメインを組織に反映する。
 *
 * 行政を名乗る組織は .lg.jp / .go.jp のときだけバッジを付ける。
 * 独自ドメインの所有を証明できても「行政である」ことの証明にはならないため、
 * ドメインの記録だけ残してバッジは保留する。
 */
async function applyVerifiedDomain(
  organization: Organization,
  domain: string,
): Promise<DomainVerificationOutcome> {
  const isGovernment = organization.type === "GOVERNMENT";
  const badgeGranted = !isGovernment || isGovernmentDomain(domain);

  await prisma.organization.update({
    where: { id: organization.id },
    data: {
      verifiedDomain: domain,
      domainVerifiedAt: new Date(),
      verified: badgeGranted ? true : organization.verified,
    },
  });

  if (badgeGranted) {
    return {
      verified: true,
      badgeGranted: true,
      message: `ドメイン ${domain} を確認しました。組織の確認済みバッジが有効になりました。`,
    };
  }

  return {
    verified: true,
    badgeGranted: false,
    message:
      `ドメイン ${domain} を確認しました。ただし行政組織の確認済みバッジは ` +
      `.lg.jp / .go.jp のドメインでのみ自動付与されます。` +
      `独自ドメインの場合は運営の確認をお待ちください。`,
  };
}

/**
 * 確認済みメールアドレスのドメインを根拠に、組織のドメイン確認を試みる。
 *
 * 対象は ADMIN のみ。一般メンバーのメールドメインで組織全体の確認を
 * 通してしまうと、組織の代表性の担保が弱くなるため。
 */
export async function tryVerifyOrganizationByEmailDomain(
  userId: string,
): Promise<DomainVerificationOutcome | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { organization: true },
  });
  if (!user || user.role !== "ADMIN" || !user.emailVerifiedAt) return null;

  const domain = domainOfEmail(user.email);
  if (!domain) return null;

  const claimed = user.organization.claimedDomain;
  // 主張ドメインが未設定なら、確認済みメールのドメインをそのまま根拠にする。
  // 主張済みなら、その主張と一致するときだけ通す。
  if (claimed && claimed !== domain) return null;
  if (user.organization.verifiedDomain === domain) return null;

  return applyVerifiedDomain(user.organization, domain);
}

/** DNS TXT 確認用のトークンを発行(または再利用)する。 */
export async function ensureDomainToken(
  organizationId: string,
  domain: string,
): Promise<string> {
  const organization = await prisma.organization.findUniqueOrThrow({
    where: { id: organizationId },
  });

  // 主張ドメインが変わったらトークンを作り直す(古い TXT を使い回させない)。
  if (organization.claimedDomain === domain && organization.domainToken) {
    return organization.domainToken;
  }

  const token = `odb-verify-${randomBytes(16).toString("hex")}`;
  await prisma.organization.update({
    where: { id: organizationId },
    data: { claimedDomain: domain, domainToken: token },
  });
  return token;
}

/**
 * DNS TXT レコードを引いてドメイン所有を確認する。
 *
 * 期待するレコード: _opendata-bridge.<domain> TXT "odb-verify-..."
 */
export async function verifyDomainByDns(
  organizationId: string,
): Promise<DomainVerificationOutcome> {
  const organization = await prisma.organization.findUniqueOrThrow({
    where: { id: organizationId },
  });

  const domain = organization.claimedDomain;
  const token = organization.domainToken;
  if (!domain || !token) {
    return {
      verified: false,
      badgeGranted: false,
      message: "先に確認したいドメインを登録してください。",
    };
  }

  let records: string[][];
  try {
    records = await dns.resolveTxt(`${DNS_TXT_NAME}.${domain}`);
  } catch {
    return {
      verified: false,
      badgeGranted: false,
      message:
        `${DNS_TXT_NAME}.${domain} の TXT レコードが見つかりませんでした。` +
        `レコードを追加してから、反映を待って再度お試しください。`,
    };
  }

  // TXT は複数文字列に分割されて返ることがあるため連結して比較する。
  const found = records.some((chunks) => chunks.join("").trim() === token);
  if (!found) {
    return {
      verified: false,
      badgeGranted: false,
      message: "TXT レコードは見つかりましたが、値が一致しませんでした。",
    };
  }

  return applyVerifiedDomain(organization, domain);
}
