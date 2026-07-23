"use client";

import "leaflet/dist/leaflet.css";
import { useMemo, useState } from "react";
import { MapContainer, TileLayer, Marker, Popup, CircleMarker } from "react-leaflet";
import L, { DivIcon } from "leaflet";
import Link from "next/link";
import { MAP_STATUS_GROUPS, type MapStatusGroup } from "@/lib/server/status/map-colors";

export type MapCasePoint = {
  caseId: string;
  lat: number;
  lng: number;
  customerName: string;
  city: string;
  saId: string;
  statusLabel: string;
  group: MapStatusGroup;
  color: string;
};

// Centro padrão: interior de São Paulo (região atendida pela base atual —
// Campinas/Sorocaba/Indaiatuba/etc.), usado quando não há pontos para focar.
const DEFAULT_CENTER: [number, number] = [-23.0, -47.5];
const DEFAULT_ZOOM = 8;

// Usamos `divIcon` (HTML/CSS simples) em vez dos ícones-padrão do Leaflet:
// os assets PNG padrão (`marker-icon.png` etc.) não resolvem corretamente sob
// bundlers como o do Next.js sem configuração extra de asset path — divIcon
// evita esse problema por completo e ainda permite colorir por status.
function makeDivIcon(color: string) {
  return L.divIcon({
    className: "",
    html: `<div style="
      width: 16px; height: 16px; border-radius: 50%;
      background: ${color}; border: 2px solid white;
      box-shadow: 0 0 2px rgba(0,0,0,0.6);
    "></div>`,
    iconSize: [16, 16],
    iconAnchor: [8, 8],
    popupAnchor: [0, -8],
  });
}

export function MapView({ points }: { points: MapCasePoint[] }) {
  const [mode, setMode] = useState<"marcadores" | "intensidade">("marcadores");

  const icons = useMemo(() => {
    const map = new Map<string, DivIcon>();
    for (const p of points) {
      if (!map.has(p.color)) map.set(p.color, makeDivIcon(p.color));
    }
    return map;
  }, [points]);

  const center: [number, number] =
    points.length > 0
      ? [
          points.reduce((s, p) => s + p.lat, 0) / points.length,
          points.reduce((s, p) => s + p.lng, 0) / points.length,
        ]
      : DEFAULT_CENTER;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex gap-2 flex-wrap text-xs">
          {Object.values(MAP_STATUS_GROUPS).map((g) => (
            <span key={g.label} className="flex items-center gap-1 px-2 py-1 rounded-full" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
              <span style={{ width: 10, height: 10, borderRadius: "50%", background: g.color, display: "inline-block" }} />
              {g.label}
            </span>
          ))}
        </div>
        <div className="flex gap-1 text-xs">
          <button
            onClick={() => setMode("marcadores")}
            className="px-2 py-1 rounded"
            style={{
              background: mode === "marcadores" ? "var(--brand)" : "var(--surface)",
              color: mode === "marcadores" ? "var(--brand-fg)" : "var(--text)",
              border: "1px solid var(--border)",
            }}
          >
            Marcadores
          </button>
          <button
            onClick={() => setMode("intensidade")}
            className="px-2 py-1 rounded"
            style={{
              background: mode === "intensidade" ? "var(--brand)" : "var(--surface)",
              color: mode === "intensidade" ? "var(--brand-fg)" : "var(--text)",
              border: "1px solid var(--border)",
            }}
            title="Aproximação visual de mapa de calor via círculos semi-transparentes (leaflet.heat não está instalado nesta fase)"
          >
            Intensidade
          </button>
        </div>
      </div>

      <div style={{ height: 560, borderRadius: 12, overflow: "hidden", border: "1px solid var(--border)" }}>
        <MapContainer center={center} zoom={DEFAULT_ZOOM} style={{ height: "100%", width: "100%" }}>
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          {mode === "marcadores"
            ? points.map((p) => (
                <Marker key={p.caseId} position={[p.lat, p.lng]} icon={icons.get(p.color)}>
                  <Popup>
                    <div className="text-sm space-y-1">
                      <div className="font-semibold">{p.customerName}</div>
                      <div>{p.city}</div>
                      <div>SA {p.saId}</div>
                      <div>{p.statusLabel}</div>
                      <Link href={`/operacoes/${p.caseId}`} className="underline text-blue-600">
                        Abrir caso
                      </Link>
                    </div>
                  </Popup>
                </Marker>
              ))
            : points.map((p) => (
                <CircleMarker
                  key={p.caseId}
                  center={[p.lat, p.lng]}
                  radius={14}
                  pathOptions={{ color: p.color, fillColor: p.color, fillOpacity: 0.25, opacity: 0.35, weight: 1 }}
                />
              ))}
        </MapContainer>
      </div>
      <p className="text-xs" style={{ color: "var(--text-muted)" }}>
        {points.length} ponto(s) no mapa. Modo &quot;Intensidade&quot; é uma aproximação visual via
        círculos sobrepostos (biblioteca de heatmap real não instalada nesta fase).
      </p>
    </div>
  );
}
