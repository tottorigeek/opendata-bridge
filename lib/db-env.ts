/**
 * DB 接続 URL の解決層。
 *
 * このアプリは 2 通りの設定方法に対応する:
 *   1. 手動設定        … DATABASE_URL / DIRECT_URL を自分で設定(従来どおり)
 *   2. Integration 利用 … Vercel の Marketplace Integration(Supabase)が
 *                          自動注入する環境変数をそのまま使う
 *
 * Marketplace Integration(Supabase)が注入する変数名は公式ドキュメントで確認:
 *   https://supabase.com/docs/guides/integrations/vercel-marketplace
 *     - プーラー(Prisma 用): POSTGRES_PRISMA_URL
 *     - 直接続(非プーリング): POSTGRES_URL_NON_POOLING
 *     - その他: POSTGRES_URL / SUPABASE_URL / SUPABASE_JWT_SECRET など
 *
 * 一部レポートでは SUPABASE_ プレフィックス付き
 * (SUPABASE_POSTGRES_PRISMA_URL / SUPABASE_POSTGRES_URL_NON_POOLING)で
 * 注入される事例もあるため、安全側に倒して両方をフォールバック対象に含める。
 *
 * 既知の問題として、Marketplace 版のプーラー URL には `pgbouncer=true` が
 * 自動付与されない(https://github.com/supabase/supabase/issues/27328)。
 * Prisma はプーラー(PgBouncer/Supavisor transaction mode)経由では
 * プリペアドステートメントを無効化する必要があるため、プーラー URL を
 * 検出したら `pgbouncer=true` を自動付与する(下記 ensurePgBouncer 参照)。
 *
 * 本モジュールは「純関数 + process.env 読み取り」の薄い層とし、
 * node 単体で挙動を検証できるようにする。
 */

/** 空文字・未定義を除外して最初に見つかった値を返す。 */
function firstDefined(...values: Array<string | undefined>): string | undefined {
  for (const value of values) {
    if (value && value.trim().length > 0) return value;
  }
  return undefined;
}

/**
 * プーラー(PgBouncer/Supavisor transaction mode)経由の接続 URL かどうか。
 * 判定基準:
 *   - ポート 6543(Supabase transaction pooler の既定ポート)
 *   - ホスト名に "pooler.supabase.com" を含む(Supavisor 共有プーラー)
 */
export function isPooledUrl(url: string): boolean {
  // :6543 の直後がパス(/)・クエリ(?)・終端のいずれかであることを確認し、
  // パスワード等に "6543" が偶然含まれるケースの誤検出を避ける。
  if (/:6543(\/|\?|$)/.test(url)) return true;
  if (/pooler\.supabase\.com/i.test(url)) return true;
  return false;
}

/** URL に pgbouncer クエリパラメータが既に付いているか。 */
function hasPgBouncerParam(url: string): boolean {
  return /[?&]pgbouncer=/i.test(url);
}

/**
 * プーラー URL に `pgbouncer=true` を(未付与のときだけ)付ける。
 *
 * 注意: `connection_limit=1` は敢えて付けない。
 *   Vercel の Fluid compute 環境では接続数を 1 に絞ると同時実行のたびに
 *   接続確立コストが発生し、かえってレイテンシ悪化・接続枯渇を招くとの報告があるため。
 *   接続上限はプーラー側(Supavisor)に委ねる。
 *
 * パスワードに特殊文字を含む接続文字列を壊さないよう、URL の再エンコードは行わず
 * 末尾へのクエリ追記だけで済ませる(new URL().toString() は再エンコードの恐れ)。
 */
function ensurePgBouncer(url: string): string {
  if (!isPooledUrl(url)) return url;
  if (hasPgBouncerParam(url)) return url;
  return url.includes("?") ? `${url}&pgbouncer=true` : `${url}?pgbouncer=true`;
}

/**
 * 通常クエリ用のプーラー接続 URL を解決する。
 *
 * 優先順位(最初に見つかったもの):
 *   1. DATABASE_URL                   … 手動設定 / 従来互換
 *   2. POSTGRES_PRISMA_URL            … Vercel Marketplace(Supabase)注入
 *   3. SUPABASE_POSTGRES_PRISMA_URL   … プレフィックス付き注入のフォールバック
 *
 * プーラー URL なのに pgbouncer=true が無ければ自動付与する。
 * いずれも見つからなければ undefined(呼び出し側は schema の env() に委ねる)。
 */
export function resolvePooledUrl(): string | undefined {
  const url = firstDefined(
    process.env.DATABASE_URL,
    process.env.POSTGRES_PRISMA_URL,
    process.env.SUPABASE_POSTGRES_PRISMA_URL,
  );
  if (!url) return undefined;
  return ensurePgBouncer(url);
}

/**
 * マイグレーション用の直接続 URL を解決する。
 *
 * 優先順位(最初に見つかったもの):
 *   1. DIRECT_URL                        … 手動設定 / 従来互換
 *   2. POSTGRES_URL_NON_POOLING          … Vercel Marketplace(Supabase)注入
 *   3. SUPABASE_POSTGRES_URL_NON_POOLING … プレフィックス付き注入のフォールバック
 *
 * 直接続は非プーリングなので pgbouncer は付与しない。
 * いずれも見つからなければ undefined。
 */
export function resolveDirectUrl(): string | undefined {
  return firstDefined(
    process.env.DIRECT_URL,
    process.env.POSTGRES_URL_NON_POOLING,
    process.env.SUPABASE_POSTGRES_URL_NON_POOLING,
  );
}
