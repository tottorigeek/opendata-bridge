"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import RegionSelect from "@/components/RegionSelect";

const LICENSE_PRESETS = [
  "CC-BY-4.0",
  "CC0",
  "政府標準利用規約(第2.0版)",
  "CC-BY-SA-4.0",
  "独自ライセンス",
];

const UPDATE_FREQUENCY_PRESETS = [
  "不定期",
  "リアルタイム",
  "日次",
  "週次",
  "月次",
  "四半期",
  "年次",
  "更新なし",
];

const CUSTOM_LICENSE = "独自ライセンス";

export interface DatasetFormInitial {
  id: string;
  title: string;
  description: string;
  license: string;
  tags: string;
  updateFrequency: string;
  visibility: string;
  hasFile: boolean;
  prefecture: string | null;
  municipality: string | null;
  /** マージ結果でライセンスを自動判定できなかった状態。 */
  licenseUnresolved: boolean;
}

const inputClass =
  "w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-100";
const labelClass = "mb-1 block text-sm font-medium text-slate-700";

export default function DatasetForm({
  mode,
  initial,
}: {
  mode: "create" | "edit";
  initial?: DatasetFormInitial;
}) {
  const router = useRouter();

  const presetMatch =
    initial && LICENSE_PRESETS.includes(initial.license)
      ? initial.license
      : initial
        ? CUSTOM_LICENSE
        : "CC-BY-4.0";

  const [licenseSelect, setLicenseSelect] = useState(presetMatch);
  const [customLicense, setCustomLicense] = useState(
    initial && !LICENSE_PRESETS.includes(initial.license) ? initial.license : "",
  );
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const form = new FormData(e.currentTarget);
    // ライセンスは選択値 or 自由入力を統合
    const license =
      licenseSelect === CUSTOM_LICENSE
        ? customLicense.trim() || CUSTOM_LICENSE
        : licenseSelect;
    form.set("license", license);

    // ファイル未選択なら送らない(edit 時に既存ファイルを維持するため)
    const fileEntry = form.get("file");
    if (fileEntry instanceof File && fileEntry.size === 0) {
      form.delete("file");
    }

    const url =
      mode === "create" ? "/api/datasets" : `/api/datasets/${initial!.id}`;
    const method = mode === "create" ? "POST" : "PATCH";

    try {
      const res = await fetch(url, { method, body: form });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "保存に失敗しました。");
        setLoading(false);
        return;
      }
      const id = data.id ?? initial?.id;
      router.push(`/dashboard/datasets/${id}`);
      router.refresh();
    } catch {
      setError("通信エラーが発生しました。");
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="max-w-2xl space-y-6">
      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div>
        <label className={labelClass}>
          タイトル<span className="text-red-500">*</span>
        </label>
        <input
          name="title"
          required
          defaultValue={initial?.title ?? ""}
          placeholder="例: 鳥取県 指定緊急避難場所一覧"
          className={inputClass}
        />
      </div>

      <div>
        <label className={labelClass}>説明</label>
        <textarea
          name="description"
          rows={4}
          defaultValue={initial?.description ?? ""}
          placeholder="データの概要・出典・利用上の注意などを記載します。"
          className={inputClass}
        />
      </div>

      {initial?.licenseUnresolved && (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          このデータセットは、マージ元のライセンスから結果のライセンスを
          自動で判定できませんでした。<strong>出典それぞれの条件を確認</strong>
          したうえでライセンスを設定してください。設定するまで公開申請はできません。
        </div>
      )}

      <div className="grid gap-5 sm:grid-cols-2">
        <div>
          <label className={labelClass}>ライセンス</label>
          <select
            value={licenseSelect}
            onChange={(e) => setLicenseSelect(e.target.value)}
            className={inputClass}
          >
            {LICENSE_PRESETS.map((l) => (
              <option key={l} value={l}>
                {l}
              </option>
            ))}
          </select>
          {licenseSelect === CUSTOM_LICENSE && (
            <input
              value={customLicense}
              onChange={(e) => setCustomLicense(e.target.value)}
              placeholder="ライセンス名を自由入力"
              className={`${inputClass} mt-2`}
            />
          )}
        </div>

        <div>
          <label className={labelClass}>更新頻度</label>
          <select
            name="updateFrequency"
            defaultValue={initial?.updateFrequency ?? "不定期"}
            className={inputClass}
          >
            {UPDATE_FREQUENCY_PRESETS.map((f) => (
              <option key={f} value={f}>
                {f}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div>
        <label className={labelClass}>対象地域</label>
        <p className="mb-2 text-xs text-slate-500">
          このデータが対象とする地域です。未指定の場合は組織の所在地
          (組織設定)がカタログの絞り込みに使われます。
        </p>
        <RegionSelect
          prefectureName="prefecture"
          municipalityName="municipality"
          initialPrefecture={initial?.prefecture}
          initialMunicipality={initial?.municipality}
          selectClassName={inputClass}
          labelClassName="mb-1 block text-xs font-medium text-slate-600"
        />
      </div>

      <div>
        <label className={labelClass}>タグ(カンマ区切り)</label>
        <input
          name="tags"
          defaultValue={initial?.tags ?? ""}
          placeholder="例: 防災, 避難所, 鳥取県"
          className={inputClass}
        />
      </div>

      <div>
        <label className={labelClass}>公開範囲</label>
        <select
          name="visibility"
          defaultValue={initial?.visibility ?? "PRIVATE"}
          className={inputClass}
        >
          <option value="PRIVATE">非公開(自分の組織の作業用)</option>
          <option value="ORG_ONLY">組織内のみ(公開時に組織メンバーへ)</option>
          <option value="PUBLIC">一般公開(承認後カタログに掲載)</option>
        </select>
        <p className="mt-1 text-xs text-slate-500">
          実際にカタログへ掲載されるには、公開申請 → 組織 ADMIN の承認が必要です。
        </p>
      </div>

      <div>
        <label className={labelClass}>
          CSV ファイル
          {mode === "edit" && (
            <span className="ml-1 text-xs font-normal text-slate-500">
              (差し替える場合のみ選択)
            </span>
          )}
        </label>
        <input
          name="file"
          type="file"
          accept=".csv,text/csv"
          className="block w-full text-sm text-slate-600 file:mr-3 file:rounded-md file:border-0 file:bg-sky-50 file:px-3 file:py-2 file:text-sm file:font-medium file:text-sky-700 hover:file:bg-sky-100"
        />
        <p className="mt-1 text-xs text-slate-500">
          UTF-8 / Shift_JIS の CSV に対応。1 行目をカラム名として読み取ります。
          {mode === "edit" && initial?.hasFile && (
            <span className="ml-1 text-emerald-600">現在アップロード済みのファイルがあります。</span>
          )}
        </p>
      </div>

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={loading}
          className="rounded-md bg-sky-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-sky-700 disabled:opacity-60"
        >
          {loading ? "保存中..." : mode === "create" ? "作成する" : "変更を保存"}
        </button>
        <button
          type="button"
          onClick={() => router.back()}
          className="rounded-md px-4 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-100"
        >
          キャンセル
        </button>
      </div>
    </form>
  );
}
