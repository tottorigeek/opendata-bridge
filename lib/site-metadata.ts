import type { Metadata } from "next";

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
