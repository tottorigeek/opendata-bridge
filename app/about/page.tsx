import Image from "next/image";
import Link from "next/link";
import SiteHeader from "@/components/SiteHeader";

export const metadata = {
  title: "OpenData Bridge とは — 官民のデータを、根拠を保ったままつなぐ",
  description:
    "行政と民間がデータを持ち寄り、住所などの表記ゆれを吸収して名寄せ・統合するオープンデータ基盤です。出典・版・ライセンスを保ったまま結合できます。",
};

/** 機能セクション。説明とスクリーンショットを交互に配置する。 */
function Feature({
  eyebrow,
  title,
  children,
  image,
  alt,
  width = 1600,
  height,
  reverse = false,
}: {
  eyebrow: string;
  title: string;
  children: React.ReactNode;
  image: string;
  alt: string;
  width?: number;
  height: number;
  reverse?: boolean;
}) {
  return (
    <div className="grid items-center gap-8 lg:grid-cols-2">
      <div className={reverse ? "lg:order-2" : ""}>
        <p className="text-sm font-semibold text-sky-700">{eyebrow}</p>
        <h3 className="mt-1 text-2xl font-bold tracking-tight text-slate-900">
          {title}
        </h3>
        <div className="mt-3 space-y-3 text-slate-600">{children}</div>
      </div>
      <div className={reverse ? "lg:order-1" : ""}>
        <Image
          src={image}
          alt={alt}
          width={width}
          height={height}
          className="rounded-xl border border-slate-200 shadow-sm"
        />
      </div>
    </div>
  );
}

const DURABILITY = [
  {
    title: "版を残す",
    body: "CSV を差し替えるたびに版が増え、過去の版もそのまま取得できます。内容が同じなら版は増えません。",
  },
  {
    title: "外部から取り込む",
    body: "CKAN などの API や CSV の URL を登録すると定期的に取り込みます。認証情報は暗号化して保存します。",
  },
  {
    title: "出典の更新を知らせる",
    body: "マージ結果は、出典に新しい版が出ると「更新があります」と示します。既定では勝手に作り直しません。",
  },
  {
    title: "自動追従には歯止めを置く",
    body: "自動で作り直す設定にしても、キー列が消えたりカバー率が大きく落ちた場合は適用せず、通知だけ行います。",
  },
  {
    title: "承認を通してから公開",
    body: "下書き → 承認待ち → 公開の流れがあり、公開は組織の管理者が承認します。",
  },
  {
    title: "REST API で使う",
    body: "API キーを発行すれば、公開データの一覧・メタデータ・本体を JSON / CSV で取得できます。",
  },
];

export default function AboutPage() {
  return (
    <>
      <SiteHeader />
      <main className="flex-1">
        {/* 導入 */}
        <section className="border-b border-slate-200 bg-gradient-to-b from-sky-50 to-white">
          <div className="mx-auto max-w-5xl px-4 py-20 text-center">
            <p className="text-sm font-semibold text-sky-700">
              官民共存型オープンデータ管理システム
            </p>
            <h1 className="mt-3 text-4xl font-bold tracking-tight text-slate-900 sm:text-5xl">
              官民のデータを、
              <br className="sm:hidden" />
              根拠を保ったままつなぐ
            </h1>
            <p className="mx-auto mt-6 max-w-2xl text-lg text-slate-600">
              行政と民間が同じ基盤にデータを持ち寄り、住所などの表記ゆれを吸収して
              名寄せ・統合します。結合した結果には
              <strong className="text-slate-900">出典・版・ライセンス</strong>
              が残るので、あとから「この値がどこから来たのか」を辿れます。
            </p>
            <div className="mt-8 flex flex-wrap justify-center gap-3">
              <Link
                href="/catalog"
                className="rounded-md bg-sky-600 px-6 py-3 text-sm font-semibold text-white hover:bg-sky-700"
              >
                公開カタログを見る
              </Link>
              <Link
                href="/signup"
                className="rounded-md border border-slate-300 bg-white px-6 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                組織を登録する
              </Link>
            </div>
          </div>
        </section>

        {/* 解決する課題 */}
        <section className="border-b border-slate-200 bg-white">
          <div className="mx-auto max-w-5xl px-4 py-16">
            <h2 className="text-center text-2xl font-bold tracking-tight text-slate-900">
              公開されているのに、つながらない
            </h2>
            <p className="mx-auto mt-3 max-w-2xl text-center text-slate-600">
              同じ場所を指しているのに、書き方が違うだけで機械は結合できません。
            </p>

            <div className="mt-10 grid gap-4 sm:grid-cols-2">
              <div className="rounded-xl border border-slate-200 p-5">
                <p className="text-xs font-medium text-slate-500">
                  行政の避難所一覧
                </p>
                <p className="mt-2 font-mono text-sm text-slate-800">
                  鳥取県鳥取市栄町一丁目2番3号
                </p>
              </div>
              <div className="rounded-xl border border-slate-200 p-5">
                <p className="text-xs font-medium text-slate-500">
                  民間の店舗データ
                </p>
                <p className="mt-2 font-mono text-sm text-slate-800">
                  鳥取県鳥取市栄町1-2-3
                </p>
              </div>
            </div>

            <div className="mt-6 rounded-xl border border-sky-200 bg-sky-50 p-6 text-center">
              <p className="text-sm text-sky-900">
                この 2 つを完全一致で結合すると
                <strong className="mx-1 text-xl">0%</strong>
                しかつながりません。住所正規化を通すと
                <strong className="mx-1 text-xl">40%</strong>
                がつながります。
              </p>
              <p className="mt-2 text-xs text-sky-800">
                ※ 同梱のデモデータ(避難所 20 件 × 店舗 14
                件)での実測値です。都道府県の有無・丁目番地号・漢数字・カナのゆれを吸収します。
              </p>
            </div>
          </div>
        </section>

        {/* できること */}
        <section className="bg-slate-50">
          <div className="mx-auto max-w-6xl space-y-20 px-4 py-20">
            <h2 className="text-center text-3xl font-bold tracking-tight text-slate-900">
              できること
            </h2>

            <Feature
              eyebrow="探す"
              title="自治体・地域で横断的に探す"
              image="/about/catalog.webp"
              alt="公開データカタログの画面。キーワード・組織種別・都道府県・市区町村で絞り込める。"
              height={1075}
            >
              <p>
                行政・民間が公開したデータを一箇所で検索できます。キーワードやタグに加えて、
                <strong className="text-slate-900">都道府県と市区町村</strong>
                で絞り込めます。
              </p>
              <p className="text-sm">
                市区町村は総務省の全国地方公共団体コード(47 都道府県 / 1,741
                市区町村)に基づくマスタから選ぶため、選択肢の側に表記ゆれが起きません。
                データセットに対象地域が設定されていない場合は、提供組織の所在地が使われます。
              </p>
            </Feature>

            <Feature
              eyebrow="辿る"
              title="どの組織が何を出しているかを見る"
              image="/about/organizations.webp"
              alt="組織一覧の画面。種別バッジ・所在地・公開データセット数が並ぶ。"
              height={1075}
              reverse
            >
              <p>
                組織ごとのページから、その組織が公開しているデータをまとめて見られます。
                データから組織へ、組織からその組織の全データへと辿れます。
              </p>
              <p className="text-sm">
                「行政」バッジは自己申告では付きません。
                <strong className="text-slate-900">ドメインの所有確認</strong>
                が取れた組織にだけ表示します。
                <code className="mx-1 rounded bg-slate-100 px-1 py-0.5 text-xs">
                  .lg.jp
                </code>
                は地方公共団体しか取得できないため、本人確認書類を扱わずに
                「その自治体の関係者である」ことを示せます。
              </p>
            </Feature>

            <Feature
              eyebrow="つなぐ"
              title="結合する前に、噛み合うかを確かめる"
              image="/about/affinity.webp"
              alt="マージ型の選択と相性チェックの結果。カバー率 A 40.0% / B 57.1%、重なり 30.8%、正規化の寄与 0.0% から 40.0% が表示されている。"
              width={1251}
              height={477}
            >
              <p>
                マージは目的で選びます。
                <strong className="text-slate-900">項目拡張型</strong>
                は手元のデータの行を保ったまま項目を増やし、
                <strong className="text-slate-900">共通抽出型</strong>
                は両方に存在する行だけを取り出します。
              </p>
              <p>
                実行前に<strong className="text-slate-900">相性チェック</strong>
                を走らせると、両側のカバー率・重なり・キーの識別力・1
                行あたりの対応数・推定出力行数が分かります。
                <strong className="text-slate-900">
                  正規化がどれだけ効いたか
                </strong>
                (完全一致なら何 % だったか)も併せて示します。
              </p>
              <p className="text-sm">
                どの列で結合すべきか分からないときは、候補を総当たりで診断して提案させることもできます。
                結果を作らずに診断するので、何度試しても副作用はありません。
              </p>
            </Feature>

            <Feature
              eyebrow="根拠を残す"
              title="結合した結果から、出典を辿れる"
              image="/about/lineage.webp"
              alt="マージ結果の来歴パネル。2 つの出典・ライセンス・版番号・カバー率が表示されている。"
              height={433}
              reverse
            >
              <p>
                マージ結果には、どのデータのどの版から作られたかが構造化して残ります。
                元データが削除・改名されても、当時のタイトル・組織名・ライセンスは来歴側に写してあるため壊れません。
              </p>
              <p className="text-sm">
                <strong className="text-slate-900">ライセンスは継承</strong>
                されます。判定できる組み合わせは安全側の候補を提示し、判定できない場合は未確定のままにして公開申請を止めます。
                出典の条件を確認しないまま公開されることを防ぐためです。
              </p>
            </Feature>

            <Feature
              eyebrow="協働する"
              title="誤りを指摘し、組織が答える"
              image="/about/requests.webp"
              alt="データリクエストの一覧画面。受け取ったリクエストと送ったリクエストが並ぶ。"
              height={1125}
            >
              <p>
                公開データの誤りの指摘や、新しいデータの公開依頼を組織へ送れます。
                受け取った側は状態(受付済み・対応中・対応済み・対応しない)を管理し、同じ画面で返信できます。
              </p>
              <p className="text-sm">
                受付範囲は組織ごとに選べます。既定は
                <strong className="text-slate-900">
                  メール確認済みの利用者から受け付ける
                </strong>
                で、住民やシビックテックからの指摘も拾えます。届いたリクエストは通知されます。
              </p>
            </Feature>
          </div>
        </section>

        {/* 継続して使うための仕組み */}
        <section className="border-y border-slate-200 bg-white">
          <div className="mx-auto max-w-5xl px-4 py-16">
            <h2 className="text-center text-2xl font-bold tracking-tight text-slate-900">
              一度きりで終わらせないための仕組み
            </h2>
            <p className="mx-auto mt-3 max-w-2xl text-center text-slate-600">
              データは更新されます。更新されても壊れないように作ってあります。
            </p>

            <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {DURABILITY.map((item) => (
                <div
                  key={item.title}
                  className="rounded-xl border border-slate-200 p-5"
                >
                  <h3 className="font-semibold text-slate-900">{item.title}</h3>
                  <p className="mt-2 text-sm text-slate-600">{item.body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* オープンソース */}
        <section className="bg-slate-900">
          <div className="mx-auto max-w-4xl px-4 py-16 text-center">
            <h2 className="text-2xl font-bold tracking-tight text-white">
              オープンソースです
            </h2>
            <p className="mx-auto mt-4 max-w-2xl text-slate-300">
              AGPL-3.0 で公開しており、自組織のサーバーで動かせます。
              提供者が撤退しても運用を続けられることは、公共のデータ基盤にとって重要な条件だと考えています。
            </p>
            <a
              href="https://github.com/tottorigeek/opendata-bridge"
              className="mt-8 inline-block rounded-md bg-white px-6 py-3 text-sm font-semibold text-slate-900 hover:bg-slate-100"
            >
              GitHub でソースを見る
            </a>
          </div>
        </section>

        {/* 導線 */}
        <section className="bg-white">
          <div className="mx-auto max-w-4xl px-4 py-16 text-center">
            <h2 className="text-2xl font-bold tracking-tight text-slate-900">
              まずは公開データを見てみてください
            </h2>
            <p className="mt-3 text-slate-600">
              登録しなくても、カタログの閲覧と CSV のダウンロードができます。
            </p>
            <div className="mt-8 flex flex-wrap justify-center gap-3">
              <Link
                href="/catalog"
                className="rounded-md bg-sky-600 px-6 py-3 text-sm font-semibold text-white hover:bg-sky-700"
              >
                公開カタログを見る
              </Link>
              <Link
                href="/signup"
                className="rounded-md border border-slate-300 px-6 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                組織を登録する
              </Link>
            </div>
          </div>
        </section>
      </main>
    </>
  );
}
