"use client";

import dynamic from "next/dynamic";
import type { MapPoint } from "@/lib/geo";

// Leaflet は読み込み時に window を参照するため、サーバーでは描画しない。
// ssr: false はクライアントコンポーネントからしか指定できないので、この薄い層を挟む。
const DatasetMap = dynamic(() => import("./DatasetMap"), {
  ssr: false,
  loading: () => (
    <div className="flex h-[28rem] w-full items-center justify-center rounded-xl border border-slate-200 bg-slate-50 text-sm text-slate-500">
      地図を読み込んでいます…
    </div>
  ),
});

export default function DatasetMapLoader({ points }: { points: MapPoint[] }) {
  return <DatasetMap points={points} />;
}
