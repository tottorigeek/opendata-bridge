import type { MetadataRoute } from "next";
import { absoluteUrl } from "@/lib/site-metadata";

/**
 * robots.txt。
 * 管理画面と内部 API は検索の対象外にする。公開 API(/api/v1)は API キーが必要で、
 * 検索結果に出しても意味がないため同じく外す。データのダウンロード
 * (/api/datasets/{id}/download)も、ページ側から辿れれば十分なので外す。
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/dashboard", "/api/"],
      },
    ],
    sitemap: absoluteUrl("/sitemap.xml"),
  };
}
