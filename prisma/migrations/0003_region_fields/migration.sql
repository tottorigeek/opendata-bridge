-- AlterTable: 組織の所在自治体。既存組織は未設定(NULL)から始める。
ALTER TABLE "Organization" ADD COLUMN     "prefecture" TEXT;
ALTER TABLE "Organization" ADD COLUMN     "municipality" TEXT;

-- AlterTable: データセットの対象地域。NULL のときはカタログ検索が
--   発行組織の所在地へフォールバックするため、既存行のバックフィルは不要。
ALTER TABLE "Dataset" ADD COLUMN     "prefecture" TEXT;
ALTER TABLE "Dataset" ADD COLUMN     "municipality" TEXT;

-- CreateIndex: カタログの地域絞り込み用。都道府県のみの絞り込みでも
--   複合インデックスの先頭列として効く。
CREATE INDEX "Organization_prefecture_municipality_idx" ON "Organization"("prefecture", "municipality");
CREATE INDEX "Dataset_prefecture_municipality_idx" ON "Dataset"("prefecture", "municipality");
