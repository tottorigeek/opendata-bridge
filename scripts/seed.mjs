/**
 * シード実行ラッパー。
 *
 * prisma/seed.ts はモジュール読み込み時に `new PrismaClient()` を生成するため、
 * その前に接続 URL を解決して process.env に流し込む必要がある。
 * lib/db-env.ts と同じ解決ロジックで DATABASE_URL / DIRECT_URL を確定させてから
 * `node prisma/seed.ts` を子プロセス実行する。
 *
 * これにより、手動設定でも Vercel Marketplace Integration(POSTGRES_PRISMA_URL 等)でも
 * 同じシードスクリプトがそのまま動く。`prisma db seed` / `prisma migrate reset` からも
 * この経路(package.json の prisma.seed)で呼ばれる。
 */
import { spawnSync } from "node:child_process";
import { resolvePooledUrl, resolveDirectUrl } from "./db-env.mjs";

const pooled = resolvePooledUrl();
const direct = resolveDirectUrl();

if (!pooled) {
  console.error(
    [
      "[seed] データベース接続 URL が見つかりません。",
      "  DATABASE_URL(手動設定)または POSTGRES_PRISMA_URL(Integration 注入)を設定してください。",
    ].join("\n"),
  );
  process.exit(1);
}

const env = {
  ...process.env,
  DATABASE_URL: pooled,
  DIRECT_URL: direct ?? pooled,
};

const result = spawnSync("node", ["prisma/seed.ts"], {
  stdio: "inherit",
  env,
  shell: process.platform === "win32",
});

if (result.error) {
  console.error("[seed] seed の起動に失敗しました:", result.error);
  process.exit(1);
}
process.exit(result.status ?? 1);
