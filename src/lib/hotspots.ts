import { distanceKm } from "./geo";
import { trustWeight } from "./trust";
import { CATEGORIES, type Category, type LatLng, type Report } from "./types";

export interface Hotspot {
  lat: number;
  lng: number;
  count: number;
  avgSeverity: number;
  topCategory: string;
  distanceKm: number;
  direction: string;
  /** e.g. "Kashmere Gate" – nearest metro station, for a human-readable name */
  near?: string;
}

// ~900 m grid cells
const CELL = 0.008;
const DIRECTIONS = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];

function direction(from: LatLng, to: LatLng) {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const y = Math.sin(toRad(to.lng - from.lng)) * Math.cos(toRad(to.lat));
  const x =
    Math.cos(toRad(from.lat)) * Math.sin(toRad(to.lat)) -
    Math.sin(toRad(from.lat)) * Math.cos(toRad(to.lat)) * Math.cos(toRad(to.lng - from.lng));
  const deg = ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
  return DIRECTIONS[Math.round(deg / 45) % 8];
}

/** Clusters reports within `radiusKm` into grid cells and returns the worst cells first. */
export function findHotspots(point: LatLng, reports: Report[], radiusKm = 3, limit = 4): Omit<Hotspot, "near">[] {
  const cells = new Map<string, Report[]>();
  for (const r of reports) {
    if (distanceKm(point, r) > radiusKm) continue;
    const key = `${Math.floor(r.lat / CELL)}:${Math.floor(r.lng / CELL)}`;
    cells.set(key, [...(cells.get(key) ?? []), r]);
  }

  return [...cells.values()]
    .filter((rs) => rs.length >= 2)
    .map((rs) => {
      const lat = rs.reduce((s, r) => s + r.lat, 0) / rs.length;
      const lng = rs.reduce((s, r) => s + r.lng, 0) / rs.length;
      const severitySum = rs.reduce((s, r) => s + r.severity, 0);
      const weighted = rs.reduce((s, r) => s + r.severity * trustWeight(r), 0);
      const byCat = new Map<Category, number>();
      for (const r of rs) byCat.set(r.category, (byCat.get(r.category) ?? 0) + 1);
      const top = [...byCat.entries()].sort((a, b) => b[1] - a[1])[0][0];
      return {
        lat,
        lng,
        count: rs.length,
        avgSeverity: Number((severitySum / rs.length).toFixed(1)),
        topCategory: CATEGORIES[top].short,
        distanceKm: Number(distanceKm(point, { lat, lng }).toFixed(2)),
        direction: direction(point, { lat, lng }),
        weighted,
      };
    })
    // Worst first: severity weighted by how well each report is verified.
    .sort((a, b) => b.weighted - a.weighted)
    .slice(0, limit)
    .map((h) => ({
      lat: h.lat,
      lng: h.lng,
      count: h.count,
      avgSeverity: h.avgSeverity,
      topCategory: h.topCategory,
      distanceKm: h.distanceKm,
      direction: h.direction,
    }));
}
