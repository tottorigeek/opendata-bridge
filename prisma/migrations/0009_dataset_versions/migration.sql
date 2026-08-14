-- CreateEnum
CREATE TYPE "VersionSource" AS ENUM ('UPLOAD', 'SYNC', 'MERGE');

-- AlterTable: 来歴にマージで使った版番号を持たせる。
--   版の導入前に作られた来歴は null のままにする(遡って埋められないため)。
ALTER TABLE "MergeLineageInput" ADD COLUMN     "versionNumber" INTEGER;

-- CreateTable
CREATE TABLE "DatasetVersion" (
    "id" TEXT NOT NULL,
    "datasetId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "filePath" TEXT NOT NULL,
    "columnsJson" TEXT NOT NULL DEFAULT '[]',
    "rowCount" INTEGER NOT NULL DEFAULT 0,
    "contentHash" TEXT NOT NULL DEFAULT '',
    "source" "VersionSource" NOT NULL DEFAULT 'UPLOAD',
    "note" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DatasetVersion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DatasetVersion_datasetId_number_key" ON "DatasetVersion"("datasetId", "number");
CREATE INDEX "DatasetVersion_datasetId_createdAt_idx" ON "DatasetVersion"("datasetId", "createdAt");

-- AddForeignKey
ALTER TABLE "DatasetVersion" ADD CONSTRAINT "DatasetVersion_datasetId_fkey" FOREIGN KEY ("datasetId") REFERENCES "Dataset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 既存データの移行: CSV を持つデータセットに初版を作る。
--   filePath は移行前のキーをそのまま入れるため、ストレージ上のファイルを
--   動かす必要はない。contentHash は SQL で計算できないので空のままにし、
--   次に版が作られた時点から埋まる。
--   source は、外部データソースを持つものは SYNC、マージ結果は MERGE、
--   それ以外は UPLOAD とみなす。
INSERT INTO "DatasetVersion" ("id", "datasetId", "number", "filePath", "columnsJson", "rowCount", "contentHash", "source", "note", "createdAt")
SELECT
    'dsv_' || d."id",
    d."id",
    1,
    d."filePath",
    d."columnsJson",
    d."rowCount",
    '',
    CASE
        WHEN d."sourceType" = 'MERGED' THEN 'MERGE'::"VersionSource"
        WHEN EXISTS (SELECT 1 FROM "DataSource" s WHERE s."datasetId" = d."id") THEN 'SYNC'::"VersionSource"
        ELSE 'UPLOAD'::"VersionSource"
    END,
    '版の導入前に登録されたデータを初版として記録',
    d."createdAt"
FROM "Dataset" d
WHERE d."filePath" IS NOT NULL;
