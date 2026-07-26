import Link from "next/link";
import DatasetForm from "@/components/datasets/DatasetForm";

export default function NewDatasetPage() {
  return (
    <div>
      <nav className="text-sm text-slate-500">
        <Link href="/dashboard/datasets" className="hover:text-sky-700">
          データセット
        </Link>
        <span className="mx-1.5">/</span>
        <span className="text-slate-700">新規作成</span>
      </nav>
      <h1 className="mt-2 text-2xl font-bold text-slate-900">
        データセットの新規作成
      </h1>
      <p className="mt-1 text-slate-600">
        メタデータを入力し、CSV ファイルをアップロードします。作成後に公開申請ができます。
      </p>
      <div className="mt-8">
        <DatasetForm mode="create" />
      </div>
    </div>
  );
}
