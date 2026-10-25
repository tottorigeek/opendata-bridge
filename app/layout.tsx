import type { Metadata } from "next";
import "./globals.css";
import { baseOpenGraph } from "@/lib/site-metadata";

/**
 * 正規 URL・OGP の絶対 URL の基準。
 * SITE_URL(例: https://opendata-bridge.vercel.app)を優先し、未設定なら Vercel が注入する
 * 本番ドメインを使う。セルフホストでは SITE_URL を設定する。
 */
function siteUrl(): URL {
  const explicit = process.env.SITE_URL?.trim();
  if (explicit) return new URL(explicit);
  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim();
  if (vercel) return new URL(`https://${vercel}`);
  return new URL("http://localhost:3000");
}

export const metadata: Metadata = {
  metadataBase: siteUrl(),
  title: "OpenData Bridge",
  description:
    "官民共存型オープンデータ管理システム — 行政と民間がデータを持ち寄り、名寄せ・マージして利活用する基盤。",
  openGraph: baseOpenGraph,
  twitter: { card: "summary" },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja" className="h-full antialiased">
      <body className="min-h-full flex flex-col bg-slate-50 text-slate-900">
        {children}
      </body>
    </html>
  );
}
