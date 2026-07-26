import { PrismaClient } from "@prisma/client";
import { resolvePooledUrl } from "./db-env";

// Next.js の開発時ホットリロードで PrismaClient が多重生成されるのを防ぐシングルトン。
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

// DATABASE_URL(手動)または Vercel Marketplace Integration が注入する
// POSTGRES_PRISMA_URL 等を解決する。見つかれば datasourceUrl で明示指定し、
// プーラー URL には pgbouncer=true を自動付与した接続文字列を使う。
// undefined のときは従来どおり schema の env("DATABASE_URL") に委ねる。
const datasourceUrl = resolvePooledUrl();

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    ...(datasourceUrl ? { datasourceUrl } : {}),
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
