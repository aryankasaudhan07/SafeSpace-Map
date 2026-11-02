import data from "@/data/safe-places.json";
import { distanceKm } from "./geo";
import type { LatLng } from "./types";
import { PLACE_KINDS, type NearbyPlace, type PlaceKind, type SafePlace } from "./safety";

// Real places exported from OpenStreetMap (see scripts/build-safe-places.mjs).
const PLACES = data as SafePlace[];

const WALK_KMH = 4.8;
const PER_KIND: Record<PlaceKind, number> = { police: 3, hospital: 3, metro: 3, fuel: 2 };

/** Nearest safe places of each kind within `maxKm`, closest first. */
export function nearbyPlaces(point: LatLng, maxKm = 6): NearbyPlace[] {
  const seen = new Set<string>();
  const withDistance = PLACES.map((p) => ({ ...p, distanceKm: distanceKm(point, p) }))
    .filter((p) => p.distanceKm <= maxKm)
    .sort((a, b) => a.distanceKm - b.distanceKm)
    // Metro stations appear once per platform node; keep the closest entry per station name.
    .filter((p) => {
      const key = p.kind === "metro" ? `metro:${p.name}` : p.id;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

  return (Object.keys(PLACE_KINDS) as PlaceKind[])
    .flatMap((kind) => withDistance.filter((p) => p.kind === kind).slice(0, PER_KIND[kind]))
    .map((p) => ({
      ...p,
      distanceKm: Number(p.distanceKm.toFixed(2)),
      walkMin: Math.max(1, Math.round((p.distanceKm / WALK_KMH) * 60)),
    }))
    .sort((a, b) => a.distanceKm - b.distanceKm);
}

export const placeCount = PLACES.length;

/** Every bundled safe place, e.g. to find those along a route. */
export const allPlaces = () => PLACES;

/** Closest place of one kind, used to give hotspots a readable name. */
export function nearestOfKind(point: LatLng, kind: PlaceKind) {
  let best: SafePlace | null = null;
  let bestKm = Infinity;
  for (const p of PLACES) {
    if (p.kind !== kind) continue;
    const km = distanceKm(point, p);
    if (km < bestKm) [best, bestKm] = [p, km];
  }
  return best ? { ...best, distanceKm: bestKm } : null;
}

/** Metro stations for the station picker, one entry per name. */
export function metroStations() {
  const byName = new Map<string, { name: string; lat: number; lng: number }>();
  for (const p of PLACES) {
    if (p.kind === "metro" && !byName.has(p.name)) byName.set(p.name, { name: p.name, lat: p.lat, lng: p.lng });
  }
  return [...byName.values()].sort((a, b) => a.name.localeCompare(b.name));
}
