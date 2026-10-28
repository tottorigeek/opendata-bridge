-- データセットのゴミ箱。削除の代わりにゴミ箱へ入れ、管理者が完全に削除する。
ALTER TYPE "DatasetStatus" ADD VALUE 'TRASHED';
ALTER TABLE "Dataset" ADD COLUMN "trashedAt" TIMESTAMP(3);
