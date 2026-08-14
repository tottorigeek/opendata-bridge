-- CreateEnum
CREATE TYPE "RequestPolicy" AS ENUM ('VERIFIED_USERS', 'VERIFIED_ORGS', 'CLOSED');
CREATE TYPE "RequestKind" AS ENUM ('CREATE', 'FIX');
CREATE TYPE "RequestStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'RESOLVED', 'DECLINED');

-- AlterTable: 受付範囲。既定はメール確認済みの利用者から受け取る。
--   住民やシビックテックからの指摘を拾えることを既定にしたいため。
ALTER TABLE "Organization" ADD COLUMN     "requestPolicy" "RequestPolicy" NOT NULL DEFAULT 'VERIFIED_USERS';

-- CreateTable: 組織へのデータリクエスト
CREATE TABLE "DataRequest" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "datasetId" TEXT,
    "requesterId" TEXT,
    "requesterName" TEXT NOT NULL,
    "requesterOrgName" TEXT NOT NULL,
    "kind" "RequestKind" NOT NULL,
    "status" "RequestStatus" NOT NULL DEFAULT 'OPEN',
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DataRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DataRequest_organizationId_status_idx" ON "DataRequest"("organizationId", "status");
CREATE INDEX "DataRequest_datasetId_idx" ON "DataRequest"("datasetId");

-- CreateTable: リクエストへの返信
CREATE TABLE "DataRequestReply" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "authorId" TEXT,
    "authorName" TEXT NOT NULL,
    "fromOrganization" BOOLEAN NOT NULL DEFAULT false,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DataRequestReply_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DataRequestReply_requestId_idx" ON "DataRequestReply"("requestId");

-- AddForeignKey
ALTER TABLE "DataRequest" ADD CONSTRAINT "DataRequest_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 対象データセット・送信者が消えても、依頼そのものは残す(写した名前で追える)。
ALTER TABLE "DataRequest" ADD CONSTRAINT "DataRequest_datasetId_fkey" FOREIGN KEY ("datasetId") REFERENCES "Dataset"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "DataRequest" ADD CONSTRAINT "DataRequest_requesterId_fkey" FOREIGN KEY ("requesterId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "DataRequestReply" ADD CONSTRAINT "DataRequestReply_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "DataRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DataRequestReply" ADD CONSTRAINT "DataRequestReply_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
