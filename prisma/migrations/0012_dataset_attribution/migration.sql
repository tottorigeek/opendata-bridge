-- データセットの出典(元データの作成者・転載元)。提供組織とは別に帰属表示する名前と参照先。
ALTER TABLE "Dataset" ADD COLUMN "attribution" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Dataset" ADD COLUMN "attributionUrl" TEXT NOT NULL DEFAULT '';
