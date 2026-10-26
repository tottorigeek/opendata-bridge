"use client";

import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "leaflet.markercluster/dist/MarkerCluster.css";
import { coreBounds, type MapPoint } from "@/lib/geo";

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

/** 1 地点のマーカー。画像アイコンはバンドル時にパスが壊れやすいので、CSS で描いた丸を使う。 */
const pointIcon = L.divIcon({
  className: "odb-map-point",
  iconSize: [14, 14],
  iconAnchor: [7, 7],
  popupAnchor: [0, -6],
});

/** クラスター(まとめた地点)のアイコン。件数に応じて大きさを変える。 */
function clusterIcon(count: number): L.DivIcon {
  const size = count < 10 ? 34 : count < 100 ? 42 : 52;
  const label = document.createElement("span");
  label.textContent = count.toLocaleString("ja-JP");
  // Leaflet がアイコンの表示方法を上書きするため、flex に頼らず行の高さで上下中央に置く
  // (6 は上下の枠線 3px ずつ)
  label.style.display = "block";
  label.style.lineHeight = `${size - 6}px`;
  label.style.textAlign = "center";
  return L.divIcon({
    html: label,
    className: "odb-map-cluster",
    iconSize: [size, size],
  });
}

/**
 * 全画面表示の切り替え。
 * ブラウザの全画面 API が使えればそれを使い、使えない環境(iPhone の Safari など)では
 * 画面いっぱいに固定表示する CSS に切り替える。
 */
function createFullscreenControl(wrapper: HTMLElement, map: L.Map): L.Control {
  // 外したときに戻すイベント登録など。onAdd で設定し、onRemove で呼ぶ。
  let cleanup: (() => void) | null = null;
  const Control = L.Control.extend({
    onAdd() {
      const bar = L.DomUtil.create("div", "leaflet-bar");
      const button = L.DomUtil.create("a", "odb-map-fullscreen-button", bar);
      button.href = "#";
      button.setAttribute("role", "button");

      const isActive = () =>
        document.fullscreenElement === wrapper || wrapper.classList.contains("odb-map-pseudo-fullscreen");

      const sync = () => {
        const active = isActive();
        button.textContent = active ? "✕" : "⛶";
        button.title = active ? "全画面表示を終了" : "全画面表示";
        button.setAttribute("aria-label", button.title);
        // 全画面ではページのスクロールと競合しないので、ホイールで拡大縮小できるようにする
        if (active) map.scrollWheelZoom.enable();
        else map.scrollWheelZoom.disable();
        map.invalidateSize();
      };

      const enterPseudo = () => {
        wrapper.classList.add("odb-map-pseudo-fullscreen");
        document.body.style.overflow = "hidden";
        sync();
      };
      const exitPseudo = () => {
        wrapper.classList.remove("odb-map-pseudo-fullscreen");
        document.body.style.overflow = "";
        sync();
      };
      const onKeydown = (e: KeyboardEvent) => {
        if (e.key === "Escape" && wrapper.classList.contains("odb-map-pseudo-fullscreen")) exitPseudo();
      };

      L.DomEvent.on(button, "click", (e) => {
        L.DomEvent.preventDefault(e);
        L.DomEvent.stopPropagation(e);
        if (document.fullscreenElement === wrapper) {
          void document.exitFullscreen();
        } else if (wrapper.classList.contains("odb-map-pseudo-fullscreen")) {
          exitPseudo();
        } else if (document.fullscreenEnabled && wrapper.requestFullscreen) {
          // 対応を名乗っていても、埋め込み表示などで要求が拒否されることがある。
          // そのときは画面いっぱいの固定表示に切り替える。
          wrapper.requestFullscreen().catch(enterPseudo);
        } else {
          enterPseudo();
        }
      });
      document.addEventListener("fullscreenchange", sync);
      document.addEventListener("keydown", onKeydown);
      cleanup = () => {
        document.removeEventListener("fullscreenchange", sync);
        document.removeEventListener("keydown", onKeydown);
        if (wrapper.classList.contains("odb-map-pseudo-fullscreen")) {
          wrapper.classList.remove("odb-map-pseudo-fullscreen");
          document.body.style.overflow = "";
        }
      };
      sync();
      return bar;
    },
    onRemove() {
      cleanup?.();
    },
  });
  return new Control({ position: "topleft" });
}

/**
 * データセットの地点を地図に描く。背景は国土地理院の淡色地図。
 * 近い地点はクラスターにまとめ、拡大すると分かれる。同じ座標に重なる地点は、
 * 最大まで拡大すると放射状に広がって 1 つずつ選べる。
 */
export default function DatasetMap({ points }: { points: MapPoint[] }) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const wrapper = wrapperRef.current;
    const el = containerRef.current;
    if (!wrapper || !el || points.length === 0) return;

    let map: L.Map | null = null;
    let cancelled = false;

    (async () => {
      // leaflet.markercluster は読み込み時にグローバルの L を拡張する作りなので、
      // バンドルした Leaflet を先に window.L に置いてから読み込む。
      (window as unknown as { L: typeof L }).L = L;
      await import("leaflet.markercluster");
      if (cancelled) return;

      map = L.map(el, { scrollWheelZoom: false });
      L.tileLayer("https://cyberjapandata.gsi.go.jp/xyz/pale/{z}/{x}/{y}.png", {
        attribution:
          '<a href="https://maps.gsi.go.jp/development/ichiran.html" target="_blank" rel="noopener noreferrer">地理院タイル</a>',
        maxZoom: 18,
        minZoom: 5,
      }).addTo(map);

      const cluster = L.markerClusterGroup({
        showCoverageOnHover: false,
        spiderfyOnMaxZoom: true,
        maxClusterRadius: 50,
        // 数千点を 1 点ずつ足すとその間ページが固まるので、まとめて少しずつ処理させる
        chunkedLoading: true,
        iconCreateFunction: (c) => clusterIcon(c.getChildCount()),
      });
      const markers = points.map((p) =>
        L.marker([p.lat, p.lng], { icon: pointIcon }).bindPopup(() => popupContent(p), {
          maxWidth: 320,
        }),
      );
      // 最初の表示範囲は、点が集まっている部分に合わせる(遠く離れた数件で引きすぎないように)。
      // 点の座標から直接求めるので、クラスターの計算が終わる前でも正しく合わせられる。
      const bounds = coreBounds(points);
      if (bounds) map.fitBounds(bounds, { padding: [24, 24], maxZoom: 15 });
      cluster.addTo(map);
      cluster.addLayers(markers);
      createFullscreenControl(wrapper, map).addTo(map);
    })();

    return () => {
      cancelled = true;
      map?.remove();
    };
  }, [points]);

  return (
    <div ref={wrapperRef} className="odb-map-wrap">
      <div ref={containerRef} className="odb-map h-[28rem] w-full rounded-xl border border-slate-200" />
    </div>
  );
}
