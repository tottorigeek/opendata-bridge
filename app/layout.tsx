import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "OpenData Bridge",
  description:
    "官民共存型オープンデータ管理システム — 行政と民間がデータを持ち寄り、名寄せ・マージして利活用する基盤。",
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
