import type { Metadata } from "next";

/**
 * 正規 URL・OGP・サイトマップの絶対 URL の基準。
 * SITE_URL(例: https://opendata-bridge.vercel.app)を優先し、未設定なら Vercel が注入する
 * 本番ドメインを使う。セルフホストでは SITE_URL を設定する。
 */
export function siteUrl(): URL {
  const explicit = process.env.SITE_URL?.trim();
  if (explicit) return new URL(explicit);
  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim();
  if (vercel) return new URL(`https://${vercel}`);
  return new URL("http://localhost:3000");
}

/** サイト内のパスを絶対 URL にする。 */
export function absoluteUrl(path: string): string {
  return new URL(path, siteUrl()).toString();
}

/**
 * OGP のサイト共通部分。
 *
 * Next.js のメタデータは openGraph のような項目単位で上書きされる(中身はマージされない)。
 * ページで openGraph を指定するときは、これを展開して共通部分が消えないようにする。
 */
export const baseOpenGraph = {
  siteName: "OpenData Bridge",
  locale: "ja_JP",
  type: "website",
} satisfies NonNullable<Metadata["openGraph"]>;

/** 検索結果に出さないページ(ログイン・管理画面など)のメタデータ。 */
export const noIndex = { index: false, follow: false } satisfies Metadata["robots"];
