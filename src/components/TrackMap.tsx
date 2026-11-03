"use client";

import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { badgeHtml } from "@/lib/icons";
import type { LivePoint } from "@/lib/live-shared";
import { PLACE_KINDS, type NearbyPlace } from "@/lib/safety";

interface Props {
  last: LivePoint | null;
  trail: LivePoint[];
  police: NearbyPlace[];
  /** Keep the map centred on the latest position */
  follow: boolean;
  stale: boolean;
}

/** Map for the /track viewer: the sharer's live position, accuracy circle, recent trail and nearby police. */
export default function TrackMap({ last, trail, police, follow, stale }: Props) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const layer = useRef<L.LayerGroup | null>(null);
  const centred = useRef(false);

  useEffect(() => {
    if (!el.current || map.current) return;
    map.current = L.map(el.current, { zoomControl: false, attributionControl: true }).setView([28.6139, 77.209], 12);
    L.control.zoom({ position: "bottomright" }).addTo(map.current);
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: "© OpenStreetMap contributors",
      className: "muted-tiles",
      crossOrigin: "anonymous",
    }).addTo(map.current);
    layer.current = L.layerGroup().addTo(map.current);
    centred.current = false;
    return () => {
      map.current?.remove();
      map.current = null;
    };
  }, []);

  useEffect(() => {
    const m = map.current;
    const g = layer.current;
    if (!m || !g) return;
    g.clearLayers();

    for (const p of police) {
      L.marker([p.lat, p.lng], {
        icon: L.divIcon({ className: "", html: badgeHtml(PLACE_KINDS.police.icon, PLACE_KINDS.police.color, 28), iconSize: [28, 28], iconAnchor: [14, 14] }),
      })
        .bindTooltip(p.name)
        .addTo(g);
    }

    if (trail.length > 1) {
      L.polyline(
        trail.map((p) => [p.lat, p.lng] as L.LatLngTuple),
        { color: "#2563eb", weight: 4, opacity: 0.45, dashArray: "2 8", lineCap: "round" },
      ).addTo(g);
    }

    if (!last) return;
    const color = stale ? "#94a3b8" : "#2563eb";
    if (last.accuracy) {
      L.circle([last.lat, last.lng], { radius: last.accuracy, stroke: false, fillColor: color, fillOpacity: 0.12 }).addTo(g);
    }
    L.marker([last.lat, last.lng], {
      icon: L.divIcon({
        className: "",
        html: `<span class="live-dot${stale ? " is-stale" : ""}"></span>`,
        iconSize: [22, 22],
        iconAnchor: [11, 11],
      }),
      zIndexOffset: 1000,
    }).addTo(g);

    if (!centred.current) {
      m.setView([last.lat, last.lng], 16);
      centred.current = true;
    } else if (follow) {
      m.panTo([last.lat, last.lng], { animate: true });
    }
  }, [last, trail, police, follow, stale]);

  return <div ref={el} className="h-full w-full" />;
}
