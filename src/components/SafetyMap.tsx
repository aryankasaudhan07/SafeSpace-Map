"use client";

import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet.heat";
import "leaflet/dist/leaflet.css";
import { AREA_RADIUS_KM } from "@/lib/geo";
import { badgeHtml, iconSvg } from "@/lib/icons";
import { ROUTE_LINE, type ScoredRoute } from "@/lib/route-shared";
import { PLACE_KINDS, directionsUrl, type NearbyPlace } from "@/lib/safety";
import { trustStatus, trustWeight } from "@/lib/trust";
import { CATEGORIES, TIMES, type LatLng, type Report } from "@/lib/types";

interface Props {
  reports: Report[];
  view: "heat" | "pins";
  pickMode: boolean;
  picked: LatLng | null;
  focus: LatLng | null;
  flyTo: LatLng | null;
  onMapClick: (p: LatLng) => void;
  /** Help mode: the user's position and safe places around it */
  me?: LatLng | null;
  places?: NearbyPlace[];
  selectedPlaceId?: string | null;
  onVote?: (id: string, vote: "confirm" | "dispute") => void;
  /** Safe-route mode: candidate routes, the chosen one, and the start/end points */
  routes?: ScoredRoute[];
  selectedRouteId?: string | null;
  onSelectRoute?: (id: string) => void;
  routeFrom?: LatLng | null;
  routeTo?: LatLng | null;
}

const DELHI: L.LatLngTuple = [28.6139, 77.209];

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

const TRUST_BADGE = {
  verified: (r: Report) => `<span style="background:#dcfce7;color:#166534;border-radius:999px;padding:1px 8px">✓ Confirmed by ${r.confirms}</span>`,
  unverified: () => '<span style="background:#f1f5f9;color:#475569;border-radius:999px;padding:1px 8px">Unverified</span>',
  disputed: (r: Report) => `<span style="background:#ffedd5;color:#9a3412;border-radius:999px;padding:1px 8px">Disputed by ${r.disputes}</span>`,
};

const voteButton = (id: string, vote: string, label: string, icon: string) =>
  `<button data-vote="${vote}" data-id="${escapeHtml(id)}" style="flex:1;display:flex;align-items:center;justify-content:center;gap:5px;border:none;background:#f5f5f7;border-radius:999px;padding:6px 8px;font-size:11px;cursor:pointer;color:#0f172a">${icon}${label}</button>`;

function popupHtml(r: Report) {
  const cat = CATEGORIES[r.category];
  return `<div style="min-width:200px;max-width:260px;font-family:inherit">
    <div style="font-weight:600;margin-bottom:4px">${escapeHtml(r.title)}</div>
    <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:6px;font-size:11px">
      <span style="background:${cat.color};color:#fff;border-radius:999px;padding:1px 8px">${cat.short}</span>
      <span style="background:#f1f5f9;border-radius:999px;padding:1px 8px">Severity ${r.severity}/5</span>
      ${TRUST_BADGE[trustStatus(r)](r)}
      ${r.demo ? '<span style="background:#fef3c7;color:#92400e;border-radius:999px;padding:1px 8px">Demo data</span>' : ""}
    </div>
    <div style="font-size:12px;color:#334155;margin-bottom:4px">${escapeHtml(r.description)}</div>
    <div style="font-size:11px;color:#64748b">${TIMES[r.timeOfDay]} · ${new Date(r.createdAt).toLocaleDateString("en-IN")}</div>
    <div style="display:flex;gap:6px;margin-top:8px">
      ${voteButton(r.id, "confirm", "I've seen this too", iconSvg("thumbsUp", { size: 13, fg: "#059669" }))}
      ${voteButton(r.id, "dispute", "Not accurate", iconSvg("flag", { size: 13, fg: "#ea580c" }))}
    </div>
  </div>`;
}

function placePopup(p: NearbyPlace) {
  const kind = PLACE_KINDS[p.kind];
  return `<div style="min-width:180px;font-family:inherit">
    <div style="display:flex;align-items:center;gap:8px;font-weight:600">${badgeHtml(kind.icon, kind.color, 24)}<span>${escapeHtml(p.name)}</span></div>
    <div style="font-size:12px;color:#475569;margin:2px 0 6px">${kind.single} · ${p.distanceKm} km · ~${p.walkMin} min walk</div>
    <a href="${directionsUrl(p)}" target="_blank" rel="noreferrer" style="font-size:12px;font-weight:600;color:#1d4ed8">Get directions →</a>
  </div>`;
}

export default function SafetyMap({
  reports,
  view,
  pickMode,
  picked,
  focus,
  flyTo,
  onMapClick,
  me,
  places,
  selectedPlaceId,
  onVote,
  routes,
  selectedRouteId,
  onSelectRoute,
  routeFrom,
  routeTo,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const dataLayerRef = useRef<L.LayerGroup | null>(null);
  const overlayRef = useRef<L.LayerGroup | null>(null);
  const placesLayerRef = useRef<L.LayerGroup | null>(null);
  const placeMarkersRef = useRef(new Map<string, L.Marker>());
  const clickRef = useRef(onMapClick);
  clickRef.current = onMapClick;
  const voteRef = useRef(onVote);
  voteRef.current = onVote;
  const routeLayerRef = useRef<L.LayerGroup | null>(null);
  const selectRouteRef = useRef(onSelectRoute);
  selectRouteRef.current = onSelectRoute;
  const fittedRoutesRef = useRef<ScoredRoute[] | undefined>(undefined);
  // leaflet.heat throws on a zero-size canvas (hidden tab, collapsed layout), so track whether the map is visible.
  const [hasSize, setHasSize] = useState(false);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = L.map(containerRef.current, { zoomControl: false }).setView(DELHI, 11);
    L.control.zoom({ position: "bottomright" }).addTo(map);
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      maxZoom: 19,
      className: "muted-tiles",
    }).addTo(map);
    dataLayerRef.current = L.layerGroup().addTo(map);
    overlayRef.current = L.layerGroup().addTo(map);
    placesLayerRef.current = L.layerGroup().addTo(map);
    routeLayerRef.current = L.layerGroup().addTo(map);
    map.on("click", (e: L.LeafletMouseEvent) => clickRef.current({ lat: e.latlng.lat, lng: e.latlng.lng }));
    mapRef.current = map;
    const resizeObserver = new ResizeObserver(([entry]) => {
      const visible = entry.contentRect.width > 0 && entry.contentRect.height > 0;
      if (visible) map.invalidateSize();
      setHasSize(visible);
    });
    resizeObserver.observe(containerRef.current);
    // Vote buttons live inside popup HTML, so handle their clicks by delegation.
    // Capture phase: Leaflet popups stop click propagation before it would bubble up to the container.
    const container = containerRef.current;
    const onContainerClick = (e: MouseEvent) => {
      const btn = (e.target as HTMLElement).closest<HTMLElement>("[data-vote]");
      if (!btn) return;
      e.stopPropagation();
      voteRef.current?.(btn.dataset.id!, btn.dataset.vote as "confirm" | "dispute");
      map.closePopup();
    };
    container.addEventListener("click", onContainerClick, true);
    return () => {
      container.removeEventListener("click", onContainerClick, true);
      resizeObserver.disconnect();
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // Reports: heatmap or pins
  useEffect(() => {
    const layer = dataLayerRef.current;
    if (!layer) return;
    layer.clearLayers();
    if (view === "heat") {
      if (!hasSize) return;
      L.heatLayer(
        reports.map((r) => [r.lat, r.lng, (r.severity / 5) * trustWeight(r)]),
        {
          radius: 28,
          blur: 22,
          maxZoom: 14,
          minOpacity: 0.35,
          gradient: { 0.2: "#fde68a", 0.45: "#fb923c", 0.7: "#e11d48", 1: "#7f1d1d" },
        },
      ).addTo(layer);
    } else {
      for (const r of reports) {
        L.circleMarker([r.lat, r.lng], {
          radius: 4 + r.severity,
          color: "#fff",
          weight: 1.5,
          fillColor: CATEGORIES[r.category].color,
          fillOpacity: r.demo ? 0.75 : 0.95,
        })
          .bindPopup(popupHtml(r))
          .addTo(layer);
      }
    }
  }, [reports, view, hasSize]);

  // Picked location (report mode) and selected area (explore mode)
  useEffect(() => {
    const layer = overlayRef.current;
    if (!layer) return;
    layer.clearLayers();
    if (picked) {
      L.circleMarker([picked.lat, picked.lng], {
        radius: 10,
        color: "#e11d48",
        weight: 3,
        fillColor: "#fff",
        fillOpacity: 1,
      }).addTo(layer);
    }
    if (focus) {
      L.circle([focus.lat, focus.lng], {
        radius: AREA_RADIUS_KM * 1000,
        color: "#7c3aed",
        weight: 2,
        dashArray: "6 6",
        fillColor: "#7c3aed",
        fillOpacity: 0.06,
      }).addTo(layer);
      L.circleMarker([focus.lat, focus.lng], { radius: 5, color: "#7c3aed", fillOpacity: 1 }).addTo(layer);
    }
  }, [picked, focus]);

  // Help mode: user position + safe places
  useEffect(() => {
    const layer = placesLayerRef.current;
    if (!layer) return;
    layer.clearLayers();
    placeMarkersRef.current.clear();
    if (me) {
      L.circleMarker([me.lat, me.lng], { radius: 16, stroke: false, fillColor: "#2563eb", fillOpacity: 0.18 }).addTo(layer);
      L.circleMarker([me.lat, me.lng], { radius: 7, color: "#fff", weight: 3, fillColor: "#2563eb", fillOpacity: 1 })
        .bindTooltip("You are here")
        .addTo(layer);
    }
    for (const p of places ?? []) {
      const kind = PLACE_KINDS[p.kind];
      const icon = L.divIcon({
        className: "",
        html: badgeHtml(kind.icon, kind.color, 32),
        iconSize: [32, 32],
        iconAnchor: [16, 16],
      });
      const marker = L.marker([p.lat, p.lng], { icon }).bindPopup(placePopup(p)).addTo(layer);
      placeMarkersRef.current.set(p.id, marker);
    }
  }, [me, places]);

  useEffect(() => {
    if (selectedPlaceId) placeMarkersRef.current.get(selectedPlaceId)?.openPopup();
  }, [selectedPlaceId, places]);

  // Safe-route mode: grey alternatives under the chosen route, its reported spots, start and end markers.
  useEffect(() => {
    const map = mapRef.current;
    const layer = routeLayerRef.current;
    if (!map || !layer) return;
    layer.clearLayers();

    const selected = routes?.find((r) => r.id === selectedRouteId) ?? null;
    for (const r of routes ?? []) {
      if (r === selected) continue;
      L.polyline(r.coords, { color: ROUTE_LINE.other, weight: 6, opacity: 0.75, lineCap: "round" })
        .on("click", (e) => {
          L.DomEvent.stopPropagation(e);
          selectRouteRef.current?.(r.id);
        })
        .bindTooltip(`${r.walkMin} min · tap to compare`, { sticky: true })
        .addTo(layer);
    }
    if (selected) {
      L.polyline(selected.coords, { color: "#fff", weight: 11, opacity: 1, lineCap: "round" }).addTo(layer);
      L.polyline(selected.coords, { color: ROUTE_LINE.selected, weight: 6, opacity: 1, lineCap: "round" }).addTo(layer);
      for (const s of selected.spots) {
        L.marker([s.lat, s.lng], {
          icon: L.divIcon({ className: "", html: badgeHtml("warning", CATEGORIES[s.category].color, 26), iconSize: [26, 26], iconAnchor: [13, 13] }),
        })
          .bindTooltip(`${escapeHtml(s.title)} · ${s.distanceM} m from route`)
          .addTo(layer);
      }
    }
    const end = (p: LatLng, color: string, label: string) =>
      L.circleMarker([p.lat, p.lng], { radius: 8, color: "#fff", weight: 3, fillColor: color, fillOpacity: 1 }).bindTooltip(label).addTo(layer);
    if (routeFrom) end(routeFrom, "#111", "Start");
    if (routeTo) end(routeTo, "#e11d48", "Destination");

    // Zoom to fit once per new set of routes (not every time a different route is selected).
    if (routes?.length && fittedRoutesRef.current !== routes) {
      fittedRoutesRef.current = routes;
      map.fitBounds(L.latLngBounds(routes.flatMap((r) => r.coords)), { padding: [40, 40], maxZoom: 16 });
    }
  }, [routes, selectedRouteId, routeFrom, routeTo]);

  useEffect(() => {
    if (flyTo && mapRef.current) mapRef.current.flyTo([flyTo.lat, flyTo.lng], 14, { duration: 0.8 });
  }, [flyTo]);

  return (
    <div
      ref={containerRef}
      className="h-full w-full"
      style={{ cursor: pickMode ? "crosshair" : undefined }}
      aria-label="Safety map"
    />
  );
}
