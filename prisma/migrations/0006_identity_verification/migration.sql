-- AlterTable: メール確認の完了日時。既存ユーザーは未確認(NULL)から始まる。
ALTER TABLE "User" ADD COLUMN     "emailVerifiedAt" TIMESTAMP(3);

-- AlterTable: 組織のドメイン確認。verified を立てた根拠を残せるようにする。
ALTER TABLE "Organization" ADD COLUMN     "claimedDomain" TEXT;
ALTER TABLE "Organization" ADD COLUMN     "verifiedDomain" TEXT;
ALTER TABLE "Organization" ADD COLUMN     "domainVerifiedAt" TIMESTAMP(3);
ALTER TABLE "Organization" ADD COLUMN     "domainToken" TEXT;

-- CreateTable: メール確認トークン。平文は送信するリンクにしか存在せず、
--   DB にはハッシュだけを保存する(API キーと同じ方針)。
CREATE TABLE "EmailVerification" (
    "id" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmailVerification_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "EmailVerification_tokenHash_key" ON "EmailVerification"("tokenHash");
CREATE INDEX "EmailVerification_userId_idx" ON "EmailVerification"("userId");
CREATE INDEX "EmailVerification_expiresAt_idx" ON "EmailVerification"("expiresAt");

-- AddForeignKey
ALTER TABLE "EmailVerification" ADD CONSTRAINT "EmailVerification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
