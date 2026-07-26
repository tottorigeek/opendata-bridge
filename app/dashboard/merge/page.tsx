import { getCurrentUser } from "@/lib/auth";
import { listMergeableDatasets } from "@/lib/merge/datasets";
import MergeWizard, { type MergeDatasetItem } from "@/components/merge/MergeWizard";

/** カラム JSON を安全にパースする。 */
function parseColumns(json: string): string[] {
  try {
    const v = JSON.parse(json);
    return Array.isArray(v) ? v.filter((c) => typeof c === "string") : [];
  } catch {
    return [];
  }
}

export default async function MergePage() {
  const user = await getCurrentUser();
  const datasets = user ? await listMergeableDatasets(user) : [];

  const items: MergeDatasetItem[] = datasets.map((d) => ({
    id: d.id,
    title: d.title,
    columns: parseColumns(d.columnsJson),
    rowCount: d.rowCount,
    own: !!user && d.organizationId === user.organizationId,
    status: d.status,
    visibility: d.visibility,
    sourceType: d.sourceType,
    hasFile: !!d.filePath,
  }));

  return (
    <div>
      <h1 className="text-2xl font-bold text-slate-900">マージ</h1>
      <p className="mt-1 text-slate-600">
        自組織のデータと、公開されている他組織のデータを名寄せ・統合します。
      </p>
      <MergeWizard datasets={items} />
    </div>
  );
}
