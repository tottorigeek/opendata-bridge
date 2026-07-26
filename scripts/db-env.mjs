/**
 * DB 接続 URL 解決ロジック(ビルド/シードスクリプト用の JS 版)。
 *
 * lib/db-env.ts と同一のロジックを持つ。ビルド時に Vercel が実行する .mjs から
 * .ts を import すると Node の TypeScript 型ストリップ対応バージョンに依存して
 * しまうため、ビルド経路では TS に依存しないこの純 JS 版を使う。
 *
 * ※ lib/db-env.ts(アプリ本体= Prisma クライアントが使う正本)と挙動を必ず一致させること。
 *    仕様の詳細・出典 URL・pgbouncer 自動付与の理由は lib/db-env.ts のコメントを参照。
 */

function firstDefined(...values) {
  for (const value of values) {
    if (value && value.trim().length > 0) return value;
  }
  return undefined;
}

/** プーラー(ポート 6543 or pooler.supabase.com)経由の URL か。 */
export function isPooledUrl(url) {
  if (/:6543(\/|\?|$)/.test(url)) return true;
  if (/pooler\.supabase\.com/i.test(url)) return true;
  return false;
}

function hasPgBouncerParam(url) {
  return /[?&]pgbouncer=/i.test(url);
}

/** プーラー URL に pgbouncer=true を未付与時のみ追記(connection_limit は付けない)。 */
function ensurePgBouncer(url) {
  if (!isPooledUrl(url)) return url;
  if (hasPgBouncerParam(url)) return url;
  return url.includes("?") ? `${url}&pgbouncer=true` : `${url}?pgbouncer=true`;
}

/** 通常クエリ用プーラー URL: DATABASE_URL → POSTGRES_PRISMA_URL → SUPABASE_POSTGRES_PRISMA_URL。 */
export function resolvePooledUrl() {
  const url = firstDefined(
    process.env.DATABASE_URL,
    process.env.POSTGRES_PRISMA_URL,
    process.env.SUPABASE_POSTGRES_PRISMA_URL,
  );
  if (!url) return undefined;
  return ensurePgBouncer(url);
}

/** マイグレーション用直接続 URL: DIRECT_URL → POSTGRES_URL_NON_POOLING → SUPABASE_POSTGRES_URL_NON_POOLING。 */
export function resolveDirectUrl() {
  return firstDefined(
    process.env.DIRECT_URL,
    process.env.POSTGRES_URL_NON_POOLING,
    process.env.SUPABASE_POSTGRES_URL_NON_POOLING,
  );
}
