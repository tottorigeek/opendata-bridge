-- AlterEnum: 自動作り直しを止めたことを知らせる通知種別。
--   これまではリクエスト用の種別を流用していたが、内容と合わないため専用に分ける。
ALTER TYPE "NotificationType" ADD VALUE 'MERGE_REFRESH_BLOCKED';
