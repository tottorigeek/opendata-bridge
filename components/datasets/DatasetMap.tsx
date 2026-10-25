"use client";

import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { MapPoint } from "@/lib/geo";

/** ポップアップに出す列の上限。列の多いデータセットでポップアップが縦に伸びすぎないように。 */
const MAX_POPUP_FIELDS = 8;

/**
 * ポップアップの中身を DOM で組み立てる。
 * 値はデータセットの中身(第三者が登録したもの)なので、HTML 文字列にせず
 * textContent で入れる(Leaflet の bindPopup に文字列を渡すと HTML として解釈される)。
 */
function popupContent(point: MapPoint): HTMLElement {
  const dl = document.createElement("dl");
  dl.className = "odb-map-popup";
  for (const [name, value] of point.props.slice(0, MAX_POPUP_FIELDS)) {
    const dt = document.createElement("dt");
    dt.textContent = name;
    const dd = document.createElement("dd");
    dd.textContent = value;
    dl.append(dt, dd);
  }
  if (point.props.length > MAX_POPUP_FIELDS) {
    const more = document.createElement("p");
    more.textContent = `ほか ${point.props.length - MAX_POPUP_FIELDS} 項目`;
    dl.append(more);
  }
  return dl;
}

/**
 * データセットの地点を地図に描く。背景は国土地理院の淡色地図。
 * マーカーは画像を使わない円(画像アイコンはバンドル時にパスが壊れやすく、
 * 数千点でも軽いため)。半透明にして、同じ座標に重なる地点は濃く見えるようにする。
 */
export default function DatasetMap({ points }: { points: MapPoint[] }) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el || points.length === 0) return;

    const map = L.map(el, { scrollWheelZoom: false });
    L.tileLayer("https://cyberjapandata.gsi.go.jp/xyz/pale/{z}/{x}/{y}.png", {
      attribution:
        '<a href="https://maps.gsi.go.jp/development/ichiran.html" target="_blank" rel="noopener noreferrer">地理院タイル</a>',
      maxZoom: 18,
      minZoom: 5,
    }).addTo(map);

    const layer = L.featureGroup();
    for (const p of points) {
      L.circleMarker([p.lat, p.lng], {
        radius: 6,
        color: "#0369a1",
        weight: 1.5,
        fillColor: "#0ea5e9",
        fillOpacity: 0.55,
      })
        .bindPopup(() => popupContent(p), { maxWidth: 320 })
        .addTo(layer);
    }
    layer.addTo(map);
    map.fitBounds(layer.getBounds(), { padding: [24, 24], maxZoom: 15 });

    return () => {
      map.remove();
    };
  }, [points]);

  return <div ref={containerRef} className="h-[28rem] w-full rounded-xl border border-slate-200" />;
}
