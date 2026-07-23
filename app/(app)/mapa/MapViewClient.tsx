"use client";

import nextDynamic from "next/dynamic";
import type { MapCasePoint } from "./MapView";

// MapContainer usa `window`/`document` (Leaflet não roda em SSR) — carregamos
// o componente do mapa só no cliente. `ssr: false` só é permitido dentro de
// um Client Component, por isso este wrapper existe separado da page.tsx.
const MapView = nextDynamic(() => import("./MapView").then((m) => m.MapView), {
  ssr: false,
  loading: () => (
    <div
      style={{ height: 560, borderRadius: 12, border: "1px solid var(--border)" }}
      className="flex items-center justify-center text-sm"
    >
      Carregando mapa...
    </div>
  ),
});

export function MapViewClient({ points }: { points: MapCasePoint[] }) {
  return <MapView points={points} />;
}
