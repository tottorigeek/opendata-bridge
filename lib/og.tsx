import { ImageResponse } from "next/og";

/**
 * OGP 画像(SNS や Slack で URL を共有したときのカード画像)の生成。
 *
 * 画像の生成に使う既定のフォントには日本語が含まれないため、Google Fonts から
 * Noto Sans JP を「画像に描く文字だけ」に絞って取り寄せる(数 KB で済む)。
 * フォントが取れなかったときに日本語を描くと文字化けした画像が共有されてしまうので、
 * そのときは英字だけのサイト共通カードに切り替える。
 */

export const OG_SIZE = { width: 1200, height: 630 };
export const OG_CONTENT_TYPE = "image/png";

type FontWeight = 400 | 700;
type LoadedFont = { name: string; data: ArrayBuffer; weight: FontWeight; style: "normal" };

async function loadJapaneseFont(text: string, weight: FontWeight): Promise<LoadedFont | null> {
  try {
    const cssUrl =
      `https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@${weight}` +
      `&text=${encodeURIComponent(text)}`;
    // User-Agent を付けないと TrueType が返る(画像の生成は WOFF2 を読めない)
    const css = await (await fetch(cssUrl, { signal: AbortSignal.timeout(5000) })).text();
    const src = css.match(/src: url\((.+?)\) format\('(opentype|truetype)'\)/);
    if (!src) return null;
    const res = await fetch(src[1], { signal: AbortSignal.timeout(5000) });
    if (!res.ok) return null;
    return { name: "Noto Sans JP", data: await res.arrayBuffer(), weight, style: "normal" };
  } catch {
    return null;
  }
}

/** 長すぎるタイトルは省略する(カードに 3 行まで収める)。 */
function truncate(text: string, max: number): string {
  const chars = [...text];
  return chars.length > max ? `${chars.slice(0, max - 1).join("")}…` : text;
}

/** タイトルの長さに応じて文字の大きさを変える。 */
function titleFontSize(title: string): number {
  const n = [...title].length;
  if (n <= 16) return 72;
  if (n <= 28) return 60;
  return 48;
}

export type OgCard = {
  /** 左上の小さなラベル(例: 「オープンデータ」「組織」)。 */
  label: string;
  title: string;
  /** タイトルの下の補足(提供組織・出典など)。1 要素 1 行。 */
  lines?: string[];
  /** 右下に並べる短い情報(行数・ライセンスなど)。 */
  chips?: string[];
};

function Brand() {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
      <div
        style={{
          display: "flex",
          width: 56,
          height: 56,
          borderRadius: 12,
          background: "#0284c7",
          color: "#fff",
          fontSize: 26,
          fontWeight: 700,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        OB
      </div>
      <div style={{ display: "flex", fontSize: 30, fontWeight: 700, color: "#0f172a" }}>
        OpenData Bridge
      </div>
    </div>
  );
}

/** フォントが取れなかったときの、英字だけのカード。 */
function fallbackCard() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: 80,
          background: "linear-gradient(135deg, #e0f2fe 0%, #ffffff 60%)",
        }}
      >
        <Brand />
        <div style={{ display: "flex", marginTop: 40, fontSize: 44, color: "#334155" }}>
          Open data, shared by government and business.
        </div>
      </div>
    ),
    OG_SIZE,
  );
}

/** タイトル入りの OGP 画像を作る。 */
export async function renderOgCard(card: OgCard): Promise<ImageResponse> {
  const title = truncate(card.title, 60);
  const lines = (card.lines ?? []).filter(Boolean).map((l) => truncate(l, 40));
  const chips = (card.chips ?? []).filter(Boolean);

  const bold = await loadJapaneseFont(`${card.label}${title}OpenData Bridge`, 700);
  const regular = await loadJapaneseFont(`${lines.join("")}${chips.join("")}`, 400);
  if (!bold || !regular) return fallbackCard();

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "64px 72px",
          background: "linear-gradient(135deg, #e0f2fe 0%, #ffffff 55%)",
          fontFamily: "Noto Sans JP",
          borderLeft: "16px solid #0284c7",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div
            style={{
              display: "flex",
              alignSelf: "flex-start",
              padding: "8px 20px",
              borderRadius: 999,
              background: "#bae6fd",
              color: "#075985",
              fontSize: 26,
              fontWeight: 700,
            }}
          >
            {card.label}
          </div>
          <div
            style={{
              display: "flex",
              marginTop: 28,
              fontSize: titleFontSize(title),
              fontWeight: 700,
              lineHeight: 1.25,
              color: "#0f172a",
            }}
          >
            {title}
          </div>
          {lines.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", marginTop: 24, gap: 6 }}>
              {lines.map((line) => (
                <div key={line} style={{ display: "flex", fontSize: 30, color: "#475569" }}>
                  {line}
                </div>
              ))}
            </div>
          )}
        </div>

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <Brand />
          <div style={{ display: "flex", gap: 12 }}>
            {chips.map((chip) => (
              <div
                key={chip}
                style={{
                  display: "flex",
                  padding: "8px 18px",
                  borderRadius: 10,
                  background: "#f1f5f9",
                  border: "1px solid #cbd5e1",
                  color: "#334155",
                  fontSize: 24,
                }}
              >
                {chip}
              </div>
            ))}
          </div>
        </div>
      </div>
    ),
    {
      ...OG_SIZE,
      fonts: [
        { ...bold, name: "Noto Sans JP" },
        { ...regular, name: "Noto Sans JP" },
      ],
    },
  );
}
