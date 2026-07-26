/**
 * CSV プレビュー表(サーバー/クライアント両用の純粋コンポーネント)。
 * 先頭 N 行を表形式で表示する。データが無い場合は案内を表示。
 */
export default function CsvPreviewTable({
  columns,
  rows,
  totalRows,
  shown,
}: {
  columns: string[];
  rows: string[][];
  totalRows: number;
  shown: number;
}) {
  if (columns.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-8 text-center text-sm text-slate-500">
        プレビューできる CSV データがありません。
      </div>
    );
  }

  return (
    <div>
      <div className="overflow-x-auto rounded-lg border border-slate-200">
        <table className="min-w-full divide-y divide-slate-200 text-sm">
          <thead className="bg-slate-50">
            <tr>
              <th className="px-3 py-2 text-left text-xs font-semibold text-slate-400">
                #
              </th>
              {columns.map((c, i) => (
                <th
                  key={i}
                  className="whitespace-nowrap px-3 py-2 text-left font-semibold text-slate-700"
                >
                  {c || `列${i + 1}`}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 bg-white">
            {rows.map((row, ri) => (
              <tr key={ri} className="hover:bg-slate-50">
                <td className="px-3 py-1.5 text-xs text-slate-400">{ri + 1}</td>
                {columns.map((_, ci) => (
                  <td
                    key={ci}
                    className="whitespace-nowrap px-3 py-1.5 text-slate-700"
                  >
                    {row[ci] ?? ""}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-xs text-slate-500">
        全 {totalRows.toLocaleString("ja-JP")} 行中、先頭 {shown.toLocaleString("ja-JP")} 行を表示しています。
      </p>
    </div>
  );
}
