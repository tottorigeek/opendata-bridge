-- AlterTable: 組織種別の裏付け確認フラグ(既存組織はすべて未確認から始める)
ALTER TABLE "Organization" ADD COLUMN     "verified" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable: API キーを平文保存から SHA-256 ハッシュ保存へ移行する。
--   既存キーは平文が残っている「今このタイミング」でしかハッシュ化できないため、
--   列追加 → 既存行のバックフィル → 平文列 DROP をこの順で行う。
--   これにより発行済みキーは失効せずそのまま使い続けられる。
ALTER TABLE "ApiKey" ADD COLUMN     "keyHash" TEXT;
ALTER TABLE "ApiKey" ADD COLUMN     "keyPrefix" TEXT NOT NULL DEFAULT '';

UPDATE "ApiKey"
SET "keyHash"   = encode(sha256("key"::bytea), 'hex'),
    "keyPrefix" = substring("key" FROM 1 FOR 8);

ALTER TABLE "ApiKey" ALTER COLUMN "keyHash" SET NOT NULL;
ALTER TABLE "ApiKey" ALTER COLUMN "keyPrefix" DROP DEFAULT;

DROP INDEX "ApiKey_key_key";
ALTER TABLE "ApiKey" DROP COLUMN "key";

-- CreateIndex
CREATE UNIQUE INDEX "ApiKey_keyHash_key" ON "ApiKey"("keyHash");

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Session_userId_idx" ON "Session"("userId");

-- CreateIndex
CREATE INDEX "Session_expiresAt_idx" ON "Session"("expiresAt");

-- CreateTable
CREATE TABLE "RateLimit" (
    "id" TEXT NOT NULL,
    "bucket" TEXT NOT NULL,
    "windowStart" TIMESTAMP(3) NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "RateLimit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "RateLimit_bucket_windowStart_key" ON "RateLimit"("bucket", "windowStart");

-- CreateIndex
CREATE INDEX "RateLimit_windowStart_idx" ON "RateLimit"("windowStart");

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
