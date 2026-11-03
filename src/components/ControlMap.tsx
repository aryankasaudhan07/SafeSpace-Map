"use client";

import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { ControlAlert, Service } from "@/lib/emergency-shared";

const STATUS_COLOR = { new: "#dc2626", seen: "#d97706", dispatched: "#2563eb", resolved: "#94a3b8" } as const;

interface Props {
  alerts: ControlAlert[];
  service: Service;
  selectedId: string | null;
  onSelect: (id: string) => void;
}

/** Control-room map: one marker per alert at the caller's live (or first) position, coloured by status. */
export default function ControlMap({ alerts, service, selectedId, onSelect }: Props) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const layer = useRef<L.LayerGroup | null>(null);
  const selectRef = useRef(onSelect);
  selectRef.current = onSelect;

  useEffect(() => {
    if (!el.current || map.current) return;
    map.current = L.map(el.current, { zoomControl: false }).setView([28.6139, 77.209], 11);
    L.control.zoom({ position: "bottomright" }).addTo(map.current);
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: "© OpenStreetMap contributors",
      className: "muted-tiles",
      crossOrigin: "anonymous",
    }).addTo(map.current);
    layer.current = L.layerGroup().addTo(map.current);
    return () => {
      map.current?.remove();
      map.current = null;
    };
  }, []);

  useEffect(() => {
    const g = layer.current;
    if (!g) return;
    g.clearLayers();
    for (const a of alerts) {
      const pos = a.live ?? a;
      const status = a.cancelled ? "resolved" : (a.status[service] ?? "new");
      const selected = a.id === selectedId;
      L.circleMarker([pos.lat, pos.lng], {
        radius: selected ? 13 : 9,
        color: "#fff",
        weight: 3,
        fillColor: STATUS_COLOR[status],
        fillOpacity: 1,
      })
        .bindTooltip(`${a.name || "Caller"} · ${a.live ? "live" : "first position"}`)
        .on("click", () => selectRef.current(a.id))
        .addTo(g);
    }
  }, [alerts, service, selectedId]);

  // Centre on the selected alert.
  useEffect(() => {
    const a = alerts.find((x) => x.id === selectedId);
    if (!a || !map.current) return;
    const pos = a.live ?? a;
    map.current.flyTo([pos.lat, pos.lng], Math.max(map.current.getZoom(), 15), { duration: 0.6 });
    // Only when the selection changes, not on every poll.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);

  return <div ref={el} className="h-full w-full" />;
}
