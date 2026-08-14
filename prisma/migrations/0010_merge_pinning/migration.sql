-- AlterTable: ピン留め / latest と、品質ゲートの基準線。
--   既定はピン留め(false)。latest は問題を消すのではなく選択可能にするだけなので、
--   既定にはしない。
ALTER TABLE "MergeLineage" ADD COLUMN     "followLatest" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "MergeLineage" ADD COLUMN     "baselineStatsJson" TEXT NOT NULL DEFAULT '{}';
ALTER TABLE "MergeLineage" ADD COLUMN     "refreshedAt" TIMESTAMP(3);
ALTER TABLE "MergeLineage" ADD COLUMN     "lastRefreshMessage" TEXT NOT NULL DEFAULT '';

-- 既存の来歴は、初回の統計をそのまま基準線にする。
UPDATE "MergeLineage" SET "baselineStatsJson" = "statsJson" WHERE "baselineStatsJson" = '{}';
