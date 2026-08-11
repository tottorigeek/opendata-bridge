"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import RegionSelect from "@/components/RegionSelect";

const inputClass =
  "w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-100";

/** 組織の所在地(都道府県 / 市区町村)を設定するフォーム。ADMIN のみ表示される。 */
export default function OrgRegionForm({
  prefecture,
  municipality,
}: {
  prefecture: string | null;
  municipality: string | null;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setSaved(false);
    setLoading(true);

    try {
      const res = await fetch("/api/organization", {
        method: "PATCH",
        body: new FormData(e.currentTarget),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "保存に失敗しました。");
        return;
      }
      setSaved(true);
      router.refresh();
    } catch {
      setError("通信エラーが発生しました。");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="max-w-2xl space-y-5">
      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}
      {saved && (
        <div className="rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          所在地を保存しました。
        </div>
      )}

      <RegionSelect
        prefectureName="prefecture"
        municipalityName="municipality"
        initialPrefecture={prefecture}
        initialMunicipality={municipality}
        selectClassName={inputClass}
        labelClassName="mb-1 block text-sm font-medium text-slate-700"
      />

      <button
        type="submit"
        disabled={loading}
        className="rounded-md bg-sky-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-sky-700 disabled:opacity-60"
      >
        {loading ? "保存中..." : "所在地を保存"}
      </button>
    </form>
  );
}
