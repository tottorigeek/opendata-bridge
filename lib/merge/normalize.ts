/**
 * 正規化ライブラリ(Phase 2b マージエンジン)
 *
 * 官民のデータを名寄せするための純関数群。副作用を持たず、入力文字列から
 * 正規化済み文字列を返す。マージエンジンはキー列ごとに正規化レベルを選び、
 * 両データセットの値をここで正規化してから突き合わせる。
 *
 * すべて純関数。単体で入出力を説明できるように小さく分割している。
 */

/** 正規化レベル。キー列ごとに選択する。 */
export type NormalizationLevel = "exact" | "basic" | "kana" | "phone" | "date" | "address";

/** UI 用のレベル定義(ラベル・説明)。 */
export const NORMALIZATION_LEVELS: {
  value: NormalizationLevel;
  label: string;
  description: string;
}[] = [
  { value: "exact", label: "完全一致 (exact)", description: "変換せずそのまま比較します。" },
  {
    value: "basic",
    label: "基本 (basic)",
    description: "全角/半角・大文字小文字・前後/連続空白を統一します。",
  },
  {
    value: "kana",
    label: "カナ (kana)",
    description: "basic に加え、ひらがな⇔カタカナ・カナのゆれを吸収します。",
  },
  {
    value: "phone",
    label: "電話番号 (phone)",
    description: "ハイフン・括弧・空白を除いた数字のみで比較します。",
  },
  {
    value: "date",
    label: "日付 (date)",
    description: "各種日付表記を YYYY-MM-DD に統一します。",
  },
  {
    value: "address",
    label: "住所 (address)",
    description:
      "住所向けフル正規化。都道府県の有無・丁目番地号⇔1-2-3・漢数字・カナゆれを吸収します。",
  },
];

// ---------------------------------------------------------------------------
// 基本部品
// ---------------------------------------------------------------------------

/**
 * 全角英数字・記号 → 半角、半角カタカナ → 全角カタカナ(濁点結合含む)、
 * 全角スペース → 半角スペースを Unicode NFKC 正規化でまとめて行う。
 */
export function toHankakuAscii(input: string): string {
  return input.normalize("NFKC");
}

/** 前後空白の除去 + 連続空白(全角含む)を半角スペース1つに畳む。 */
export function collapseWhitespace(input: string): string {
  return input.replace(/[\s　]+/g, " ").trim();
}

/**
 * basic 正規化: NFKC(全半角統一)→ 小文字化 → 空白畳み込み。
 * 例: "Ｔｏｋｙｏ　 Ｓｔａｔｉｏｎ" → "tokyo station"
 */
export function normalizeBasic(input: string): string {
  return collapseWhitespace(toHankakuAscii(input).toLowerCase());
}

/** ひらがな → カタカナ。 */
export function hiraganaToKatakana(input: string): string {
  return input.replace(/[ぁ-ゖ]/g, (ch) =>
    String.fromCharCode(ch.charCodeAt(0) + 0x60),
  );
}

/**
 * カナ正規化: basic に加えてひらがなをカタカナへ寄せ、カナのゆれ(ヶ/ケ、ノ/の等)を統一。
 * 表記ゆれの多い施設名・氏名カナ列向け。
 */
export function normalizeKana(input: string): string {
  let s = toHankakuAscii(input);
  s = hiraganaToKatakana(s);
  s = unifyKanaVariants(s);
  return collapseWhitespace(s.toLowerCase());
}

/** カナのゆれを統一(名称向け): ヶ→ケ、ノ→の、ヴ→ブ。 */
export function unifyKanaVariants(input: string): string {
  return input
    .replace(/ヶ/g, "ケ") // 霞ヶ関 / 霞ケ関
    .replace(/ノ/g, "の") // 井の頭 / 井ノ頭
    .replace(/ヴ/g, "ブ");
}

/**
 * 住所向けのカナゆれ統一。名称より踏み込み、地名でよく揺れる
 * 「ヶ / ケ / が / ガ」(霞が関・自由が丘 等)を代表形「ケ」へ、「ノ→の」をまとめる。
 * 名称正規化(normalizeKana)には適用しない(氏名の「が」を壊さないため)。
 */
export function unifyAddressKanaVariants(input: string): string {
  return input.replace(/[ヶヵがガ]/g, "ケ").replace(/ノ/g, "の");
}

/**
 * 電話番号正規化: 数字以外(ハイフン・括弧・空白・ドット)を除去。
 * 例: "03-1234-5678" / "(03)1234-5678" / "０３１２３４５６７８" → "0312345678"
 */
export function normalizePhone(input: string): string {
  return toHankakuAscii(input).replace(/[^\d]/g, "");
}

/**
 * 日付正規化: 主要な表記を YYYY-MM-DD に統一。パースできない場合は basic 正規化にフォールバック。
 * 対応: 2024-1-2 / 2024/1/2 / 2024.1.2 / 2024年1月2日
 */
export function normalizeDate(input: string): string {
  const s = toHankakuAscii(input).trim();
  const m = s.match(/(\d{4})\s*[-/.年]\s*(\d{1,2})\s*[-/.月]\s*(\d{1,2})\s*日?/);
  if (m) {
    const y = m[1];
    const mo = m[2].padStart(2, "0");
    const d = m[3].padStart(2, "0");
    return `${y}-${mo}-${d}`;
  }
  return normalizeBasic(input);
}

// ---------------------------------------------------------------------------
// 漢数字 → 算用数字
// ---------------------------------------------------------------------------

const KANJI_DIGIT: Record<string, number> = {
  "〇": 0,
  "零": 0,
  "一": 1,
  "二": 2,
  "三": 3,
  "四": 4,
  "五": 5,
  "六": 6,
  "七": 7,
  "八": 8,
  "九": 9,
};
const KANJI_UNIT: Record<string, number> = { "十": 10, "百": 100, "千": 1000 };

/** 単一の漢数字ラン(例: 二十三)を数値へ変換する。 */
function convertKanjiRun(run: string): number {
  let total = 0;
  let current = 0;
  for (const ch of run) {
    if (ch in KANJI_DIGIT) {
      current = current * 10 + KANJI_DIGIT[ch];
    } else if (ch in KANJI_UNIT) {
      const unit = KANJI_UNIT[ch];
      if (current === 0) current = 1; // 十 → 10
      total += current * unit;
      current = 0;
    }
  }
  return total + current;
}

/**
 * 文字列中の漢数字ランをすべて算用数字へ変換する(汎用)。
 * 例: "一丁目二十三番" → "1丁目23番"、"二〇二四" → "2024"
 *
 * 注意: 地名(千代田・三田・四谷など)の漢字も数字化してしまうため、
 * 住所には convertAddressKanjiNumbers を使うこと。
 */
export function kanjiNumeralsToArabic(input: string): string {
  return input.replace(/[〇零一二三四五六七八九十百千]+/g, (run) =>
    String(convertKanjiRun(run)),
  );
}

/**
 * 住所向けの漢数字変換。地名(千代田区・三田・九段など)を壊さないよう、
 * 数え上げの単位(丁目/丁/番地/番/号)または区切り(の・ハイフン)が直後に続く
 * 漢数字ランのみを算用数字へ変換する。
 * 例: "一丁目二十三番" → "1丁目23番"、"千代田区" → "千代田区"(不変)
 */
export function convertAddressKanjiNumbers(input: string): string {
  return input.replace(
    /([〇零一二三四五六七八九十百千]+)(?=丁目|丁|番地|番|号|の|-)/g,
    (run) => String(convertKanjiRun(run)),
  );
}

// ---------------------------------------------------------------------------
// 住所正規化
// ---------------------------------------------------------------------------

/** 47 都道府県。住所先頭からの除去に使う。 */
const PREFECTURES = [
  "北海道",
  "青森県",
  "岩手県",
  "宮城県",
  "秋田県",
  "山形県",
  "福島県",
  "茨城県",
  "栃木県",
  "群馬県",
  "埼玉県",
  "千葉県",
  "東京都",
  "神奈川県",
  "新潟県",
  "富山県",
  "石川県",
  "福井県",
  "山梨県",
  "長野県",
  "岐阜県",
  "静岡県",
  "愛知県",
  "三重県",
  "滋賀県",
  "京都府",
  "大阪府",
  "兵庫県",
  "奈良県",
  "和歌山県",
  "鳥取県",
  "島根県",
  "岡山県",
  "広島県",
  "山口県",
  "徳島県",
  "香川県",
  "愛媛県",
  "高知県",
  "福岡県",
  "佐賀県",
  "長崎県",
  "熊本県",
  "大分県",
  "宮崎県",
  "鹿児島県",
  "沖縄県",
];

/** 住所先頭の都道府県名を取り除く(都道府県の有無を吸収するため)。 */
export function stripPrefecture(input: string): string {
  for (const pref of PREFECTURES) {
    if (input.startsWith(pref)) {
      return input.slice(pref.length);
    }
  }
  return input;
}

/**
 * 「丁目・番地・番・号」および区切り(ハイフン各種・「の」)を単一ハイフン表記へ統一する。
 * 例: "1丁目2番3号" → "1-2-3"、"1丁目2-3" → "1-2-3"
 */
export function normalizeAddressNumbering(input: string): string {
  let s = input;
  // 各種ハイフン/長音類似記号を半角ハイフンへ。
  s = s.replace(/[−—―ー－‐-]/g, "-");
  // 丁目・番地・番・号 → 区切り。号は末尾になりがちなので後で余剰ハイフンを畳む。
  s = s.replace(/丁目/g, "-");
  s = s.replace(/番地/g, "-");
  s = s.replace(/番/g, "-");
  s = s.replace(/号/g, "-");
  // 「の」(数字間の区切りとして使われるゆれ): 1の2の3 → 1-2-3
  // lookahead で後続の数字を消費しないため、連続した「の」も全て変換される。
  s = s.replace(/(\d)の(?=\d)/g, "$1-");
  // 連続ハイフンを1つに、前後のハイフンを除去。
  s = s.replace(/-{2,}/g, "-").replace(/-+$/g, "").replace(/^-+/g, "");
  return s;
}

/**
 * 住所フル正規化。以下を順に適用する:
 *  1. NFKC(全半角統一)+ 小文字化
 *  2. 空白除去
 *  3. カナゆれ統一(ヶ→ケ、ノ→の)
 *  4. 都道府県の除去(有無吸収)
 *  5. 漢数字 → 算用数字
 *  6. 丁目/番地/番/号・区切りの統一 → 1-2-3
 *
 * 例:
 *   "東京都千代田区霞が関一丁目2-3" → "千代田区霞が関1-2-3"
 *   "千代田区霞ヶ関1丁目2番3号"      → "千代田区霞が関1-2-3"
 */
export function normalizeAddress(input: string): string {
  let s = toHankakuAscii(input).toLowerCase();
  s = s.replace(/[\s　]+/g, ""); // 住所は空白を全除去して比較する
  s = unifyAddressKanaVariants(s);
  s = stripPrefecture(s);
  s = convertAddressKanjiNumbers(s); // 地名を壊さない counter-aware 変換
  s = normalizeAddressNumbering(s);
  return s;
}

// ---------------------------------------------------------------------------
// ディスパッチャ
// ---------------------------------------------------------------------------

/** 指定レベルで値を正規化する。マージエンジンから呼ばれる中心関数。 */
export function normalizeValue(value: string, level: NormalizationLevel): string {
  const v = value ?? "";
  switch (level) {
    case "exact":
      return v;
    case "basic":
      return normalizeBasic(v);
    case "kana":
      return normalizeKana(v);
    case "phone":
      return normalizePhone(v);
    case "date":
      return normalizeDate(v);
    case "address":
      return normalizeAddress(v);
    default:
      return normalizeBasic(v);
  }
}
