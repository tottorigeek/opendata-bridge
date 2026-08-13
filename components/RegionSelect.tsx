"use client";

import { useState } from "react";
import { PREFECTURES, municipalitiesOf } from "@/lib/regions";

/**
 * 入力フォーム用の地域セレクト(都道府県 → 市区町村の連動)。
 *
 * カタログの絞り込み(RegionFilter)と違い、こちらは選択しても遷移せず
 * フォームの値として保持する。市区町村だけを単独指定させないのは、
 * 同名の市町村が複数県に存在し、県が決まらないと一意にならないため。
 */
export default function RegionSelect({
  prefectureName,
  municipalityName,
  initialPrefecture,
  initialMunicipality,
  selectClassName,
  labelClassName,
}: {
  prefectureName: string;
  municipalityName: string;
  initialPrefecture?: string | null;
  initialMunicipality?: string | null;
  selectClassName: string;
  labelClassName: string;
}) {
  const [prefecture, setPrefecture] = useState(initialPrefecture ?? "");
  const [municipality, setMunicipality] = useState(initialMunicipality ?? "");

  const options = prefecture ? municipalitiesOf(prefecture) : [];

  return (
    <div className="grid gap-5 sm:grid-cols-2">
      <div>
        <label className={labelClassName}>都道府県</label>
        <select
          name={prefectureName}
          value={prefecture}
          className={selectClassName}
          onChange={(e) => {
            setPrefecture(e.target.value);
            // 県を変えると市区町村の選択肢が変わるため、必ず解除する。
            setMunicipality("");
          }}
        >
          <option value="">指定しない</option>
          {PREFECTURES.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className={labelClassName}>市区町村</label>
        <select
          name={municipalityName}
          value={municipality}
          disabled={!prefecture}
          className={`${selectClassName} disabled:bg-slate-50 disabled:text-slate-400`}
          onChange={(e) => setMunicipality(e.target.value)}
        >
          <option value="">
            {prefecture ? "指定しない(県全体)" : "先に都道府県を選択"}
          </option>
          {options.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
