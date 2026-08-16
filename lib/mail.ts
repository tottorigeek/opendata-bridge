import "server-only";

/**
 * メール送信の薄い抽象。
 *
 * 送信プロバイダが設定されていない環境(ローカル開発・検証)では、
 * 送信内容をサーバーログへ出力して「送信できたことにする」。
 * これにより、プロバイダ契約なしでも確認フローを最後まで通せる。
 *
 * 本番では MAIL_FROM に加えて、次のいずれかを設定すると実送信に切り替わる。
 * 上から順に優先される(全プロジェクト共通の規約)。
 *   1. 自前メール API: MAIL_API_URL + MAIL_API_SECRET
 *   2. Resend:         RESEND_API_KEY
 * 差し替えたい場合は sendMail の中だけを変えればよい。
 */

export interface MailMessage {
  to: string;
  subject: string;
  /** プレーンテキスト本文。HTML メールは現時点で使わない。 */
  text: string;
}

export type MailResult =
  | { delivered: true; provider: "mail-api" | "resend" }
  | { delivered: false; provider: "console"; reason: string };

/** 環境変数を読み、前後の空白を落とす。空文字は未設定として扱う。 */
function env(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value ? value : undefined;
}

/**
 * 自前メール API の送信先 URL を組み立てる。
 *
 * MAIL_API_URL が .php で終わればそのまま使い、そうでなければ
 * 末尾に /emails を付ける(Resend 互換のパス)。
 */
function mailApiEndpoint(base: string): string {
  const trimmed = base.replace(/\/$/, "");
  return /\.php$/i.test(trimmed) ? trimmed : `${trimmed}/emails`;
}

/** 送信プロバイダが設定されているか。 */
export function isMailConfigured(): boolean {
  if (!env("MAIL_FROM")) return false;
  const mailApi = Boolean(env("MAIL_API_URL") && env("MAIL_API_SECRET"));
  return mailApi || Boolean(env("RESEND_API_KEY"));
}

export async function sendMail(message: MailMessage): Promise<MailResult> {
  if (!isMailConfigured()) {
    // 開発・検証用。宛先と本文をログに出すだけで、外部へは送らない。
    console.info(
      [
        "[mail] 送信プロバイダが未設定のため、内容をログに出力します。",
        `  to: ${message.to}`,
        `  subject: ${message.subject}`,
        ...message.text.split("\n").map((line) => `  ${line}`),
      ].join("\n"),
    );
    return {
      delivered: false,
      provider: "console",
      reason:
        "MAIL_API_URL / MAIL_API_SECRET または RESEND_API_KEY と、MAIL_FROM が未設定です。",
    };
  }

  // Resend 互換の JSON ペイロード。自前メール API もこの形を受け取る。
  const payload = JSON.stringify({
    from: env("MAIL_FROM"),
    to: [message.to],
    subject: message.subject,
    text: message.text,
  });

  const mailApiUrl = env("MAIL_API_URL");
  const mailApiSecret = env("MAIL_API_SECRET");
  if (mailApiUrl && mailApiSecret) {
    const response = await fetch(mailApiEndpoint(mailApiUrl), {
      method: "POST",
      headers: {
        Authorization: `Bearer ${mailApiSecret}`,
        "Content-Type": "application/json",
      },
      body: payload,
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      throw new Error(
        `メール送信に失敗しました (${response.status}): ${detail}`,
      );
    }

    return { delivered: true, provider: "mail-api" };
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env("RESEND_API_KEY")}`,
      "Content-Type": "application/json",
    },
    body: payload,
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`メール送信に失敗しました (${response.status}): ${detail}`);
  }

  return { delivered: true, provider: "resend" };
}

/**
 * 本文中のリンクに使う絶対 URL の基点。
 *
 * Vercel では VERCEL_PROJECT_PRODUCTION_URL / VERCEL_URL が注入される。
 * 明示したい場合は APP_URL を設定する。
 */
export function appBaseUrl(): string {
  const explicit = process.env.APP_URL;
  if (explicit) return explicit.replace(/\/$/, "");

  const vercel =
    process.env.VERCEL_PROJECT_PRODUCTION_URL ?? process.env.VERCEL_URL;
  if (vercel) return `https://${vercel}`;

  return "http://localhost:3000";
}
