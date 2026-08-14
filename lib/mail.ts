import "server-only";

/**
 * メール送信の薄い抽象。
 *
 * 送信プロバイダが設定されていない環境(ローカル開発・検証)では、
 * 送信内容をサーバーログへ出力して「送信できたことにする」。
 * これにより、プロバイダ契約なしでも確認フローを最後まで通せる。
 *
 * 本番では RESEND_API_KEY と MAIL_FROM を設定すると実送信に切り替わる。
 * 差し替えたい場合は sendMail の中だけを変えればよい。
 */

export interface MailMessage {
  to: string;
  subject: string;
  /** プレーンテキスト本文。HTML メールは現時点で使わない。 */
  text: string;
}

export type MailResult =
  | { delivered: true; provider: "resend" }
  | { delivered: false; provider: "console"; reason: string };

/** 送信プロバイダが設定されているか。 */
export function isMailConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY && process.env.MAIL_FROM);
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
      reason: "RESEND_API_KEY / MAIL_FROM が未設定です。",
    };
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: process.env.MAIL_FROM,
      to: [message.to],
      subject: message.subject,
      text: message.text,
    }),
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
