import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getOwnedDataset } from "@/lib/datasets";
import DatasetForm from "@/components/datasets/DatasetForm";

export default async function EditDatasetPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const { id } = await params;
  const dataset = await getOwnedDataset(id, user);
  if (!dataset) notFound();

  return (
    <div>
      <nav className="text-sm text-slate-500">
        <Link href="/dashboard/datasets" className="hover:text-sky-700">
          データセット
        </Link>
        <span className="mx-1.5">/</span>
        <Link
          href={`/dashboard/datasets/${dataset.id}`}
          className="hover:text-sky-700"
        >
          {dataset.title}
        </Link>
        <span className="mx-1.5">/</span>
        <span className="text-slate-700">編集</span>
      </nav>
      <h1 className="mt-2 text-2xl font-bold text-slate-900">
        データセットの編集
      </h1>
      <div className="mt-8">
        <DatasetForm
          mode="edit"
          initial={{
            id: dataset.id,
            title: dataset.title,
            description: dataset.description,
            license: dataset.license,
            tags: dataset.tags,
            updateFrequency: dataset.updateFrequency,
            visibility: dataset.visibility,
            hasFile: !!dataset.filePath,
            prefecture: dataset.prefecture,
            municipality: dataset.municipality,
            licenseUnresolved: dataset.licenseUnresolved,
          }}
        />
      </div>
    </div>
  );
}
