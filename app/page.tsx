import Link from "next/link";
import SiteHeader from "@/components/SiteHeader";

export const metadata = {
  title: "OpenData Bridge — 行政と民間のデータが、出会う場所。",
  description:
    "官民共存型オープンデータ管理システム。行政・民間が双方向にデータを持ち寄り、住所などの表記ゆれを自動で名寄せ・マージし、カタログと REST API で利活用できる基盤です。",
};

/** 特徴カード用のアイコン(依存を増やさないインライン SVG)。 */
function FeatureIcon({ variant }: { variant: "share" | "merge" | "api" }) {
  const common = {
    width: 28,
    height: 28,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };
  if (variant === "share") {
    return (
      <svg {...common} aria-hidden="true">
        <circle cx="6" cy="12" r="2.5" />
        <circle cx="18" cy="6" r="2.5" />
        <circle cx="18" cy="18" r="2.5" />
        <path d="M8.2 10.8 15.8 7.2M8.2 13.2 15.8 16.8" />
      </svg>
    );
  }
  if (variant === "merge") {
    return (
      <svg {...common} aria-hidden="true">
        <path d="M4 5h6M4 19h6" />
        <path d="M10 5c0 5 4 7 10 7M10 19c0-5 4-7 10-7" />
        <path d="M17 9l3 3-3 3" />
      </svg>
    );
  }
  return (
    <svg {...common} aria-hidden="true">
      <path d="M8 9 4 12l4 3M16 9l4 3-4 3M13.5 6l-3 12" />
    </svg>
  );
}

export default function Home() {
  const features = [
    {
      variant: "share" as const,
      title: "官民双方がデータを持ち寄れる",
      body: "行政も民間も、同じ基盤に対等にデータを登録。公開範囲(一般公開 / 組織内 / 非公開)と承認フローで、安心して段階的に公開できます。",
    },
    {
      variant: "merge" as const,
      title: "類似データの名寄せ・マージ",
      body: "「一丁目2番3号」と「1-2-3」、都道府県の有無や漢数字といった住所の表記ゆれを自動で吸収。異なる組織のデータをキー結合し、新しいデータセットを生成します。",
    },
    {
      variant: "api" as const,
      title: "REST API で開発者がすぐ使える",
      body: "API キーを発行するだけで、公開データセットの一覧・メタデータ・本体を JSON / CSV で取得可能。利用量も自動で計測されます。",
    },
  ];

  const steps = [
    { n: "01", title: "登録", body: "組織(自治体 / 企業)とアカウントを作成。" },
    { n: "02", title: "アップロード", body: "CSV をアップロードし、メタデータを付与。" },
    { n: "03", title: "承認", body: "組織の管理者が内容を確認して公開を承認。" },
    { n: "04", title: "公開", body: "公開カタログに掲載され、誰でも検索・取得可能に。" },
    { n: "05", title: "マージ / API", body: "他組織のデータと名寄せ・結合、または API で利活用。" },
  ];

  const audiences = [
    {
      tag: "自治体向け",
      tagClass: "bg-sky-100 text-sky-700",
      title: "「公開したが使われない」を、使えるデータに。",
      points: [
        "避難所・観光・人口などの公開データを一元管理",
        "承認フロー付きで、庁内のガバナンスを担保",
        "民間データと掛け合わせて EBPM(証拠に基づく政策)を後押し",
      ],
    },
    {
      tag: "民間企業向け",
      tagClass: "bg-violet-100 text-violet-700",
      title: "自社データを、行政データと掛け合わせる。",
      points: [
        "店舗・人流などの自社データを安全に登録・共有",
        "住所キーで行政データと名寄せし、新しい示唆を獲得",
        "公開範囲を組織内に限定した内部活用も可能",
      ],
    },
    {
      tag: "開発者向け",
      tagClass: "bg-emerald-100 text-emerald-700",
      title: "整った官民データに、API 一本でアクセス。",
      points: [
        "Bearer トークン方式のシンプルな REST API",
        "一覧・メタデータ・本体(JSON / CSV)を取得",
        "表記ゆれ正規化済みのデータで前処理を削減",
      ],
    },
  ];

  return (
    <>
      <SiteHeader />
      <main className="flex-1">
        {/* ヒーロー */}
        <section className="relative overflow-hidden border-b border-slate-200 bg-gradient-to-b from-sky-50 to-slate-50">
          <div className="mx-auto grid max-w-6xl gap-12 px-4 py-20 sm:py-28 lg:grid-cols-2 lg:items-center">
            <div>
              <p className="mb-4 inline-block rounded-full bg-sky-100 px-3 py-1 text-xs font-semibold text-sky-700">
                官民共存型オープンデータ基盤
              </p>
              <h1 className="text-4xl font-bold leading-tight tracking-tight text-slate-900 sm:text-5xl">
                行政と民間のデータが、
                <br />
                出会う場所。
              </h1>
              <p className="mt-6 max-w-xl text-lg leading-relaxed text-slate-600">
                OpenData Bridge は、行政・民間の双方がデータを持ち寄り、住所などの
                表記ゆれを自動で名寄せ・マージして、カタログと REST API で
                利活用するためのオープンデータ管理システムです。
              </p>
              <div className="mt-10 flex flex-wrap gap-4">
                <Link
                  href="/signup"
                  className="rounded-lg bg-sky-600 px-6 py-3 text-base font-semibold text-white shadow-sm transition hover:bg-sky-700"
                >
                  無料で始める
                </Link>
                <Link
                  href="/catalog"
                  className="rounded-lg border border-slate-300 bg-white px-6 py-3 text-base font-semibold text-slate-700 transition hover:bg-slate-50"
                >
                  カタログを見る
                </Link>
              </div>
            </div>

            {/* 官民のデータが橋でつながるイメージ(インライン SVG) */}
            <div className="hidden lg:block">
              <svg
                viewBox="0 0 480 320"
                className="w-full"
                role="img"
                aria-label="行政と民間のデータが橋でつながるイメージ"
              >
                <defs>
                  <linearGradient id="bridge" x1="0" y1="0" x2="1" y2="0">
                    <stop offset="0" stopColor="#0284c7" />
                    <stop offset="1" stopColor="#7c3aed" />
                  </linearGradient>
                </defs>
                {/* 左: 行政 */}
                <rect x="24" y="96" width="150" height="128" rx="14" fill="#e0f2fe" stroke="#bae6fd" />
                <text x="99" y="128" textAnchor="middle" className="fill-sky-700" fontSize="16" fontWeight="700">
                  行政
                </text>
                <rect x="48" y="146" width="102" height="12" rx="6" fill="#7dd3fc" />
                <rect x="48" y="166" width="82" height="12" rx="6" fill="#7dd3fc" />
                <rect x="48" y="186" width="94" height="12" rx="6" fill="#7dd3fc" />
                {/* 右: 民間 */}
                <rect x="306" y="96" width="150" height="128" rx="14" fill="#ede9fe" stroke="#ddd6fe" />
                <text x="381" y="128" textAnchor="middle" className="fill-violet-700" fontSize="16" fontWeight="700">
                  民間
                </text>
                <rect x="330" y="146" width="102" height="12" rx="6" fill="#c4b5fd" />
                <rect x="330" y="166" width="82" height="12" rx="6" fill="#c4b5fd" />
                <rect x="330" y="186" width="94" height="12" rx="6" fill="#c4b5fd" />
                {/* 橋 */}
                <path d="M174 160 C 220 120, 260 120, 306 160" fill="none" stroke="url(#bridge)" strokeWidth="6" strokeLinecap="round" />
                <circle cx="240" cy="139" r="16" fill="url(#bridge)" />
                <path d="M233 139h14M240 132v14" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" />
              </svg>
            </div>
          </div>
        </section>

        {/* 特徴 3 つ */}
        <section className="bg-white">
          <div className="mx-auto max-w-6xl px-4 py-20">
            <h2 className="text-center text-3xl font-bold tracking-tight text-slate-900">
              3 つの特徴
            </h2>
            <div className="mt-12 grid gap-8 sm:grid-cols-3">
              {features.map((f) => (
                <div
                  key={f.title}
                  className="rounded-2xl border border-slate-200 bg-slate-50 p-6"
                >
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-sky-600 text-white">
                    <FeatureIcon variant={f.variant} />
                  </div>
                  <h3 className="mt-5 text-lg font-semibold text-slate-900">
                    {f.title}
                  </h3>
                  <p className="mt-2 text-sm leading-relaxed text-slate-600">
                    {f.body}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* 使い方の流れ */}
        <section className="border-t border-slate-200 bg-slate-50">
          <div className="mx-auto max-w-6xl px-4 py-20">
            <h2 className="text-center text-3xl font-bold tracking-tight text-slate-900">
              使い方の流れ
            </h2>
            <p className="mt-3 text-center text-slate-600">
              登録から利活用まで、5 ステップ。
            </p>
            <ol className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
              {steps.map((s, i) => (
                <li
                  key={s.n}
                  className="relative rounded-2xl border border-slate-200 bg-white p-5"
                >
                  <span className="text-sm font-bold text-sky-600">{s.n}</span>
                  <h3 className="mt-1 font-semibold text-slate-900">{s.title}</h3>
                  <p className="mt-1 text-sm leading-relaxed text-slate-600">
                    {s.body}
                  </p>
                  {i < steps.length - 1 && (
                    <span
                      aria-hidden="true"
                      className="absolute -right-3 top-1/2 hidden -translate-y-1/2 text-slate-300 lg:block"
                    >
                      →
                    </span>
                  )}
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* 対象ユーザー別 */}
        <section className="bg-white">
          <div className="mx-auto max-w-6xl px-4 py-20">
            <h2 className="text-center text-3xl font-bold tracking-tight text-slate-900">
              あなたの立場で使える
            </h2>
            <div className="mt-12 grid gap-8 lg:grid-cols-3">
              {audiences.map((a) => (
                <div
                  key={a.tag}
                  className="flex flex-col rounded-2xl border border-slate-200 bg-slate-50 p-6"
                >
                  <span
                    className={`inline-block w-fit rounded-full px-3 py-1 text-xs font-semibold ${a.tagClass}`}
                  >
                    {a.tag}
                  </span>
                  <h3 className="mt-4 text-lg font-semibold text-slate-900">
                    {a.title}
                  </h3>
                  <ul className="mt-4 space-y-2 text-sm leading-relaxed text-slate-600">
                    {a.points.map((p) => (
                      <li key={p} className="flex gap-2">
                        <span aria-hidden="true" className="mt-1 text-sky-600">
                          ✓
                        </span>
                        <span>{p}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* CTA 帯 */}
        <section className="border-t border-slate-200 bg-sky-600">
          <div className="mx-auto flex max-w-6xl flex-col items-center gap-6 px-4 py-16 text-center">
            <h2 className="text-3xl font-bold tracking-tight text-white">
              データを、掛け合わせて使える形に。
            </h2>
            <p className="max-w-2xl text-sky-50">
              まずは組織を登録して、データセットの公開とマージを試してみてください。
            </p>
            <div className="flex flex-wrap justify-center gap-4">
              <Link
                href="/signup"
                className="rounded-lg bg-white px-6 py-3 text-base font-semibold text-sky-700 shadow-sm transition hover:bg-sky-50"
              >
                無料で始める
              </Link>
              <Link
                href="/catalog"
                className="rounded-lg border border-sky-300 px-6 py-3 text-base font-semibold text-white transition hover:bg-sky-500"
              >
                カタログを見る
              </Link>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 px-4 py-8 text-sm text-slate-500 sm:flex-row">
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-sky-600 text-xs font-bold text-white">
              OB
            </span>
            <span className="font-semibold text-slate-700">OpenData Bridge</span>
          </div>
          <nav className="flex gap-4">
            <Link href="/catalog" className="hover:text-slate-700">
              カタログ
            </Link>
            <Link href="/dashboard" className="hover:text-slate-700">
              ダッシュボード
            </Link>
            <Link href="/login" className="hover:text-slate-700">
              ログイン
            </Link>
          </nav>
          <span>© OpenData Bridge</span>
        </div>
      </footer>
    </>
  );
}
