-- AlterTable: ライセンス未確定フラグ。既存行はすべて確定済みとして扱う
--   (マージ結果の既存データは既定値 CC-BY-4.0 が入っているが、
--    遡って未確定に倒すと公開中のデータセットが申請不能になるため触らない)。
ALTER TABLE "Dataset" ADD COLUMN     "licenseUnresolved" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable: マージ結果の来歴(出力データセット 1 件につき 1 行)
CREATE TABLE "MergeLineage" (
    "id" TEXT NOT NULL,
    "datasetId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "keyA" TEXT NOT NULL,
    "keyB" TEXT NOT NULL,
    "level" TEXT NOT NULL,
    "statsJson" TEXT NOT NULL DEFAULT '{}',
    "columnOriginsJson" TEXT NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MergeLineage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MergeLineage_datasetId_key" ON "MergeLineage"("datasetId");

-- CreateTable: マージの入力 1 件分。元が削除されても残るよう当時の値を写す。
CREATE TABLE "MergeLineageInput" (
    "id" TEXT NOT NULL,
    "lineageId" TEXT NOT NULL,
    "side" TEXT NOT NULL,
    "datasetId" TEXT,
    "title" TEXT NOT NULL,
    "license" TEXT NOT NULL,
    "organizationName" TEXT NOT NULL,
    "rowCount" INTEGER NOT NULL DEFAULT 0,
    "contentHash" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "MergeLineageInput_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MergeLineageInput_lineageId_idx" ON "MergeLineageInput"("lineageId");
CREATE INDEX "MergeLineageInput_datasetId_idx" ON "MergeLineageInput"("datasetId");

-- AddForeignKey: 出力データセットが消えたら来歴も消す。
ALTER TABLE "MergeLineage" ADD CONSTRAINT "MergeLineage_datasetId_fkey" FOREIGN KEY ("datasetId") REFERENCES "Dataset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "MergeLineageInput" ADD CONSTRAINT "MergeLineageInput_lineageId_fkey" FOREIGN KEY ("lineageId") REFERENCES "MergeLineage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 入力側のデータセットが消えても来歴の行は残す(写した値で来歴を保つ)。
ALTER TABLE "MergeLineageInput" ADD CONSTRAINT "MergeLineageInput_datasetId_fkey" FOREIGN KEY ("datasetId") REFERENCES "Dataset"("id") ON DELETE SET NULL ON UPDATE CASCADE;
