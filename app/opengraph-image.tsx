import { OG_CONTENT_TYPE, OG_SIZE, renderOgCard } from "@/lib/og";

// 個別の画像を持たないページ(トップ・カタログ一覧・サービス紹介など)で使うサイト共通の画像。
export const alt = "OpenData Bridge — 行政と民間のデータが、出会う場所。";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default async function Image() {
  return renderOgCard({
    label: "官民共存型オープンデータ基盤",
    title: "行政と民間のデータが、出会う場所。",
    lines: ["データを持ち寄り、表記ゆれを吸収して名寄せ・マージ", "カタログ・地図・REST API で利活用"],
    chips: ["オープンソース", "AGPL-3.0"],
  });
}
