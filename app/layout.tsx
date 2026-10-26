import type { Metadata } from "next";
import "./globals.css";
import { baseOpenGraph, siteUrl } from "@/lib/site-metadata";

export const metadata: Metadata = {
  metadataBase: siteUrl(),
  title: "OpenData Bridge",
  description:
    "官民共存型オープンデータ管理システム — 行政と民間がデータを持ち寄り、名寄せ・マージして利活用する基盤。",
  openGraph: baseOpenGraph,
  // OGP 画像(opengraph-image.tsx)は横長なので、大きな画像のカードで出す。
  twitter: { card: "summary_large_image" },
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
