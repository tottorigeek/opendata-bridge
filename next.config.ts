import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV === "development";

/**
 * Content-Security-Policy。
 *
 * nonce 方式(proxy.ts で毎リクエスト生成)にすると 'unsafe-inline' を外せるが、
 * 全ページが動的レンダリング必須になり静的最適化・CDN キャッシュが効かなくなる。
 * 本アプリは自前の inline script を持たず、React が既定で出力をエスケープする
 * (dangerouslySetInnerHTML も未使用)ため XSS の下地が薄い。そのため
 * Next.js が挿入する inline script のために 'unsafe-inline' を許容し、
 * それ以外(外部スクリプト読み込み・iframe 埋め込み・base 差し替え・
 * 外部へのフォーム送信)は塞ぐ構成にしている。
 *
 * 開発時のみ:
 *  - 'unsafe-eval' … React がエラースタック復元に eval を使う
 *  - upgrade-insecure-requests を外す … http://localhost が https へ強制されるのを防ぐ
 */
const cspDirectives = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' blob: data:",
  "font-src 'self'",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  ...(isDev ? [] : ["upgrade-insecure-requests"]),
];

const securityHeaders = [
  {
    key: "Content-Security-Policy",
    value: cspDirectives.join("; "),
  },
  // frame-ancestors 非対応の古いブラウザ向けクリックジャッキング対策。
  { key: "X-Frame-Options", value: "DENY" },
  // Content-Type を無視した MIME スニッフィングを禁止する。
  { key: "X-Content-Type-Options", value: "nosniff" },
  // 外部サイトへはオリジンのみ送り、データセット ID 等をパスごと渡さない。
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), payment=()",
  },
  // HSTS は本番(HTTPS)のみ。localhost に付けると開発時に https へ固定されてしまう。
  ...(isDev
    ? []
    : [
        {
          key: "Strict-Transport-Security",
          value: "max-age=63072000; includeSubDomains; preload",
        },
      ]),
];

const nextConfig: NextConfig = {
  // バージョン情報の露出を避ける(X-Powered-By: Next.js を出さない)。
  poweredByHeader: false,
  async headers() {
    return [{ source: "/(.*)", headers: securityHeaders }];
  },
};

export default nextConfig;
