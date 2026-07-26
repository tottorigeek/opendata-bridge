/**
 * ビルド時マイグレーション実行ラッパー。
 *
 * `prisma migrate deploy` は schema.prisma の env("DATABASE_URL") /
 * env("DIRECT_URL") を読む。Vercel Marketplace Integration(Supabase)利用時は
 * これらが未設定で、代わりに POSTGRES_PRISMA_URL / POSTGRES_URL_NON_POOLING が
 * 注入される。そこで lib/db-env.ts と同じ解決ロジックで接続 URL を求め、
 * process.env.DATABASE_URL / DIRECT_URL に流し込んでから prisma を子プロセス実行する。
 *
 * 手動設定(DATABASE_URL / DIRECT_URL を自分でセット)の場合はそのまま採用される。
 */
import { spawnSync } from "node:child_process";
import { resolvePooledUrl, resolveDirectUrl } from "./db-env.mjs";

const pooled = resolvePooledUrl();
const direct = resolveDirectUrl();

if (!pooled) {
  console.error(
    [
      "[migrate-deploy] データベース接続 URL が見つかりません。",
      "  次のいずれかを設定してください:",
      "    - DATABASE_URL(手動設定)",
      "    - POSTGRES_PRISMA_URL(Vercel Marketplace Integration が自動注入)",
      "  Vercel では Storage/Integrations タブから Supabase を接続すると自動設定されます。",
    ].join("\n"),
  );
  process.exit(1);
}

// マイグレーションは直接続(5432)を優先。無ければプーラー URL でフォールバック。
const directUrl = direct ?? pooled;

const env = {
  ...process.env,
  DATABASE_URL: pooled,
  DIRECT_URL: directUrl,
};

console.log("[migrate-deploy] prisma migrate deploy を実行します…");
const result = spawnSync("npx", ["prisma", "migrate", "deploy"], {
  stdio: "inherit",
  env,
  shell: process.platform === "win32", // Windows で npx を解決するため
});

if (result.error) {
  console.error("[migrate-deploy] prisma の起動に失敗しました:", result.error);
  process.exit(1);
}
process.exit(result.status ?? 1);
