-- AlterEnum: 外部 API 由来のデータセット種別を追加
-- PostgreSQL 12 以降は ALTER TYPE ... ADD VALUE をトランザクション内で実行できる
-- (追加した値を同一トランザクション内で「使う」ことだけが不可)。本マイグレーションは
-- 値を追加するだけで使用しないため問題ない。Supabase は PG15 以降。
ALTER TYPE "SourceType" ADD VALUE 'API';

-- CreateEnum
CREATE TYPE "SourceKind" AS ENUM ('REST_JSON', 'CSV_URL');

-- CreateEnum
CREATE TYPE "SourceAuthType" AS ENUM ('NONE', 'BEARER', 'HEADER', 'QUERY');

-- CreateEnum
CREATE TYPE "SyncMode" AS ENUM ('MANUAL', 'SCHEDULED');

-- CreateEnum
CREATE TYPE "SyncStatus" AS ENUM ('SUCCESS', 'FAILED');

-- CreateTable
CREATE TABLE "DataSource" (
    "id" TEXT NOT NULL,
    "datasetId" TEXT NOT NULL,
    "kind" "SourceKind" NOT NULL,
    "endpoint" TEXT NOT NULL,
    "authType" "SourceAuthType" NOT NULL DEFAULT 'NONE',
    "authValueEnc" TEXT NOT NULL DEFAULT '',
    "authParamName" TEXT NOT NULL DEFAULT '',
    "recordsPath" TEXT NOT NULL DEFAULT '',
    "fieldMapJson" TEXT NOT NULL DEFAULT '[]',
    "syncMode" "SyncMode" NOT NULL DEFAULT 'MANUAL',
    "lastSyncedAt" TIMESTAMP(3),
    "lastStatus" "SyncStatus",
    "lastMessage" TEXT NOT NULL DEFAULT '',
    "lastRowCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DataSource_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DataSource_datasetId_key" ON "DataSource"("datasetId");

-- CreateIndex
CREATE INDEX "DataSource_syncMode_idx" ON "DataSource"("syncMode");

-- CreateTable
CREATE TABLE "SyncRun" (
    "id" TEXT NOT NULL,
    "dataSourceId" TEXT NOT NULL,
    "status" "SyncStatus" NOT NULL,
    "rowCount" INTEGER NOT NULL DEFAULT 0,
    "message" TEXT NOT NULL DEFAULT '',
    "triggeredBy" TEXT NOT NULL DEFAULT 'manual',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "durationMs" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "SyncRun_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SyncRun_dataSourceId_startedAt_idx" ON "SyncRun"("dataSourceId", "startedAt");

-- AddForeignKey
ALTER TABLE "DataSource" ADD CONSTRAINT "DataSource_datasetId_fkey" FOREIGN KEY ("datasetId") REFERENCES "Dataset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SyncRun" ADD CONSTRAINT "SyncRun_dataSourceId_fkey" FOREIGN KEY ("dataSourceId") REFERENCES "DataSource"("id") ON DELETE CASCADE ON UPDATE CASCADE;
