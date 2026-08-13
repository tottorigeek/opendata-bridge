"use client";

import { useRouter } from "next/navigation";

export interface PrefectureGroup {
  pref: string;
  names: readonly string[];
}

/**
 * カタログの地域絞り込み(都道府県 / 市区町村)。
 *
 * どちらも任意で、片方だけの指定もできる。都道府県を選ぶと市区町村の選択肢が
 * その県内に絞られるため、選択と同時に再検索する必要がある。
 * JavaScript が無効でも、親フォームの「検索」ボタンで同じ絞り込みができる
 * (select に name を持たせた通常の GET フォームとして動く)。
 */
export default function RegionFilter({
  prefectures,
  prefecture,
  municipality,
  groups,
  selectClassName,
  labelClassName,
}: {
  prefectures: readonly string[];
  prefecture: string;
  municipality: string;
  /** 都道府県が選択済みなら 1 件、未選択なら全 47 件(optgroup 表示用)。 */
  groups: PrefectureGroup[];
  selectClassName: string;
  labelClassName: string;
}) {
  const router = useRouter();

  /**
   * 現在のフォーム内容を引き継ぎ、指定パラメータだけ差し替えて遷移する。
   *
   * onChange の中でフォームを submit すると、React が再レンダリングする前に
   * DOM の値が読まれ、市区町村の解除が反映されないことがある。
   * URL を自前で組み立てて push することでその競合を避けている。
   */
  function navigate(
    form: HTMLFormElement | null,
    overrides: Record<string, string>,
  ) {
    if (!form) return;
    const params = new URLSearchParams();
    for (const [key, value] of new FormData(form).entries()) {
      if (typeof value === "string" && value) params.set(key, value);
    }
    for (const [key, value] of Object.entries(overrides)) {
      if (value) params.set(key, value);
      else params.delete(key);
    }
    const qs = params.toString();
    router.push(qs ? `/catalog?${qs}` : "/catalog");
  }

  return (
    <>
      <div>
        <label className={labelClassName}>都道府県</label>
        <select
          name="pref"
          key={`pref-${prefecture}`}
          defaultValue={prefecture}
          className={selectClassName}
          onChange={(e) =>
            // 県が変わると市区町村の選択肢が変わるため、市区町村は必ず解除する。
            navigate(e.currentTarget.form, {
              pref: e.currentTarget.value,
              city: "",
            })
          }
        >
          <option value="">すべて</option>
          {prefectures.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className={labelClassName}>市区町村</label>
        <select
          name="city"
          key={`city-${prefecture}-${municipality}`}
          defaultValue={municipality}
          className={selectClassName}
          onChange={(e) =>
            navigate(e.currentTarget.form, { city: e.currentTarget.value })
          }
        >
          <option value="">すべて</option>
          {groups.length === 1
            ? groups[0].names.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))
            : groups.map((group) => (
                <optgroup key={group.pref} label={group.pref}>
                  {group.names.map((name) => (
                    <option key={`${group.pref}/${name}`} value={name}>
                      {name}
                    </option>
                  ))}
                </optgroup>
              ))}
        </select>
      </div>
    </>
  );
}
