import { ttlCache } from "./cache";
import { distanceKm } from "./geo";
import { allPlaces } from "./places";
import type { RouteLevel, RouteResult, RouteSpot, ScoredRoute } from "./route-shared";
import type { PlaceKind } from "./safety";
import { trustStatus, trustWeight } from "./trust";
import { CATEGORIES, type LatLng, type Report, type TimeOfDay } from "./types";

// Safest walking route: get several candidate routes from OSRM (OpenStreetMap foot routing), then score each
// by the community reports and staffed safe places along it.

const OSRM = "https://routing.openstreetmap.de/routed-foot/route/v1/driving";
const USER_AGENT = "SafeSpaceMap/1.0 (hackathon prototype; github.com/aryankasaudhan07/SafeSpace-Map)";
const WALK_KMH = 4.8;
/** A report counts when it's this close to the route; nearer counts more. */
const SPOT_RADIUS_M = 120;
const HELP_RADIUS_M = 150;
/** Routes much longer than the fastest aren't worth suggesting. */
const MAX_DETOUR = 1.5;
const EXTRA_MIN = 5;

type Raw = { coords: [number, number][]; distanceKm: number };

const routeCache = ttlCache<Raw[]>(30 * 60_000);

async function osrm(points: LatLng[], alternatives: number): Promise<Raw[]> {
  const path = points.map((p) => `${p.lng.toFixed(6)},${p.lat.toFixed(6)}`).join(";");
  const url = `${OSRM}/${path}?alternatives=${alternatives}&overview=full&geometries=geojson`;
  try {
    const res = await fetch(url, { headers: { "User-Agent": USER_AGENT }, signal: AbortSignal.timeout(7000) });
    if (!res.ok) return [];
    const data = (await res.json()) as { routes?: { distance: number; geometry: { coordinates: [number, number][] } }[] };
    return (data.routes ?? []).map((r) => ({
      coords: r.geometry.coordinates.map(([lng, lat]) => [lat, lng] as [number, number]),
      distanceKm: r.distance / 1000,
    }));
  } catch {
    return [];
  }
}

/** A point `km` to the left (+) or right (-) of the middle of the from→to line, to force a different route. */
function sideStep(from: LatLng, to: LatLng, km: number): LatLng {
  const mid = { lat: (from.lat + to.lat) / 2, lng: (from.lng + to.lng) / 2 };
  const kmPerLng = 111.32 * Math.cos((mid.lat * Math.PI) / 180);
  const dx = (to.lng - from.lng) * kmPerLng;
  const dy = (to.lat - from.lat) * 110.57;
  const len = Math.hypot(dx, dy) || 1;
  return { lat: mid.lat + (dx / len) * (km / 110.57), lng: mid.lng + (-dy / len) * (km / kmPerLng) };
}

// Local flat projection in metres; accurate enough over a city walk.
function projector(origin: LatLng) {
  const kx = 111_320 * Math.cos((origin.lat * Math.PI) / 180);
  return (p: { lat: number; lng: number }) => [(p.lng - origin.lng) * kx, (p.lat - origin.lat) * 110_570] as const;
}

function segmentDistance(p: readonly [number, number], a: readonly [number, number], b: readonly [number, number]) {
  const [px, py] = p;
  const [ax, ay] = a;
  const dx = b[0] - ax;
  const dy = b[1] - ay;
  const len2 = dx * dx + dy * dy;
  const t = len2 ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2)) : 0;
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

/** Distance in metres from `point` to the route line, or Infinity when clearly outside its bounding box. */
function distanceToRoute(route: { xy: (readonly [number, number])[]; box: number[] }, project: ReturnType<typeof projector>, point: LatLng, maxM: number) {
  const p = project(point);
  const [minX, minY, maxX, maxY] = route.box;
  if (p[0] < minX - maxM || p[0] > maxX + maxM || p[1] < minY - maxM || p[1] > maxY + maxM) return Infinity;
  let best = Infinity;
  for (let i = 1; i < route.xy.length; i++) best = Math.min(best, segmentDistance(p, route.xy[i - 1], route.xy[i]));
  return best;
}

/** Share of A's points lying within 40 m of B: near 1 means the same route. */
function overlap(a: Raw, b: Raw, project: ReturnType<typeof projector>) {
  const xy = b.coords.map(([lat, lng]) => project({ lat, lng }));
  const route = { xy, box: bbox(xy) };
  const step = Math.max(1, Math.floor(a.coords.length / 40));
  let near = 0;
  let total = 0;
  for (let i = 0; i < a.coords.length; i += step) {
    total++;
    const [lat, lng] = a.coords[i];
    if (distanceToRoute(route, project, { lat, lng }, 40) <= 40) near++;
  }
  return near / total;
}

function bbox(xy: (readonly [number, number])[]) {
  let [minX, minY, maxX, maxY] = [Infinity, Infinity, -Infinity, -Infinity];
  for (const [x, y] of xy) [minX, minY, maxX, maxY] = [Math.min(minX, x), Math.min(minY, y), Math.max(maxX, x), Math.max(maxY, y)];
  return [minX, minY, maxX, maxY];
}

/** Time of day in India right now, to weigh reports from the same part of the day more. */
export function currentTimeOfDay(now = new Date()): TimeOfDay {
  const h = (now.getUTCHours() + now.getUTCMinutes() / 60 + 5.5) % 24;
  if (h >= 6 && h < 12) return "morning";
  if (h >= 12 && h < 17) return "afternoon";
  if (h >= 17 && h < 21) return "evening";
  return "night";
}

function levelOf(risk: number): RouteLevel {
  if (risk === 0) return "clear";
  if (risk < 0.6) return "low";
  if (risk < 1.5) return "medium";
  return "high";
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

function categoriesText(spots: RouteSpot[]) {
  return [...new Set(spots.map((s) => CATEGORIES[s.category].short.toLowerCase()))].slice(0, 2).join(", ");
}

function helpText(h: ScoredRoute["help"]) {
  const parts = [
    h.police && plural(h.police, "police post"),
    h.metro && plural(h.metro, "metro station"),
    h.hospital && plural(h.hospital, "hospital"),
  ].filter(Boolean);
  return parts.length ? `Passes ${parts.join(", ")}.` : "";
}

function score(raw: Raw, index: number, reports: Report[], timeOfDay: TimeOfDay, project: ReturnType<typeof projector>): ScoredRoute {
  const xy = raw.coords.map(([lat, lng]) => project({ lat, lng }));
  const route = { xy, box: bbox(xy) };

  const spots: { spot: RouteSpot; weight: number }[] = [];
  for (const r of reports) {
    const d = distanceToRoute(route, project, r, SPOT_RADIUS_M);
    if (d > SPOT_RADIUS_M) continue;
    const weight = (r.severity / 5) * trustWeight(r) * (r.timeOfDay === timeOfDay ? 1.5 : 1) * (1 - (0.5 * d) / SPOT_RADIUS_M);
    spots.push({
      spot: {
        id: r.id,
        title: r.title,
        category: r.category,
        severity: r.severity,
        lat: r.lat,
        lng: r.lng,
        distanceM: Math.round(d),
        verified: trustStatus(r) === "verified",
      },
      weight,
    });
  }
  spots.sort((a, b) => b.weight - a.weight);

  const help: ScoredRoute["help"] = { police: 0, metro: 0, hospital: 0, fuel: 0 };
  const seenMetro = new Set<string>();
  for (const p of allPlaces()) {
    if (distanceToRoute(route, project, p, HELP_RADIUS_M) > HELP_RADIUS_M) continue;
    if (p.kind === "metro") {
      if (seenMetro.has(p.name)) continue;
      seenMetro.add(p.name);
    }
    help[p.kind as PlaceKind]++;
  }

  const risk = Math.round(spots.reduce((sum, s) => sum + s.weight, 0) * 100) / 100;
  return {
    id: `r${index}`,
    coords: raw.coords,
    distanceKm: Math.round(raw.distanceKm * 100) / 100,
    walkMin: Math.max(1, Math.round((raw.distanceKm / WALK_KMH) * 60)),
    risk,
    level: levelOf(risk),
    spots: spots.slice(0, 6).map((s) => s.spot),
    spotCount: spots.length,
    help,
    tags: [],
    reason: "",
  };
}

export async function safestRoutes(from: LatLng, to: LatLng, reports: Report[]): Promise<RouteResult | null> {
  const key = [from.lat, from.lng, to.lat, to.lng].map((n) => n.toFixed(4)).join(",");
  let raws = routeCache.get(key);
  if (!raws) {
    const km = distanceKm(from, to);
    const detour = Math.min(2, Math.max(0.3, km * 0.25));
    const [direct, left, right] = await Promise.all([
      osrm([from, to], 3),
      km > 0.5 ? osrm([from, sideStep(from, to, detour), to], 0) : Promise.resolve([]),
      km > 0.5 ? osrm([from, sideStep(from, to, -detour), to], 0) : Promise.resolve([]),
    ]);
    raws = [...direct, ...left, ...right];
    if (raws.length) routeCache.set(key, raws);
  }
  if (!raws.length) return null;

  // Drop near-duplicates and detours far longer than the shortest route.
  const project = projector(from);
  const shortest = Math.min(...raws.map((r) => r.distanceKm));
  const unique: Raw[] = [];
  for (const r of [...raws].sort((a, b) => a.distanceKm - b.distanceKm)) {
    if (r.distanceKm > shortest * MAX_DETOUR + (EXTRA_MIN / 60) * WALK_KMH) continue;
    if (unique.some((u) => overlap(r, u, project) > 0.8 && overlap(u, r, project) > 0.8)) continue;
    unique.push(r);
  }

  const timeOfDay = currentTimeOfDay();
  const routes = unique.slice(0, 4).map((r, i) => score(r, i, reports, timeOfDay, project));
  const fastest = routes.reduce((a, b) => (b.walkMin < a.walkMin ? b : a));
  // Fewest weighted reports wins; staffed places along the way break near-ties; then the shorter walk.
  const pickScore = (r: ScoredRoute) => r.risk - 0.05 * Math.min(r.help.police + r.help.metro + r.help.hospital, 6);
  const safest = routes.reduce((a, b) => {
    const d = pickScore(b) - pickScore(a);
    return d < -0.05 || (Math.abs(d) <= 0.05 && b.walkMin < a.walkMin) ? b : a;
  });

  fastest.tags.push("fastest");
  safest.tags.push("safest");

  for (const r of routes) {
    const count = r.spotCount;
    const cats = categoriesText(r.spots);
    let text: string;
    if (r === safest && r === fastest) {
      text = count ? `Quickest route, and it has the fewest reported spots (${count}: ${cats}).` : "No reported incidents along the way, and it's the quickest.";
    } else if (r === safest) {
      const avoided = fastest.spots.filter((s) => !r.spots.some((x) => x.id === s.id));
      const extra = r.walkMin - fastest.walkMin;
      text = avoided.length
        ? `Avoids ${plural(avoided.length, "reported spot")} on the fastest route (${categoriesText(avoided)})${extra > 0 ? ` for ${extra} min more` : ""}.`
        : `Fewer reports along the way than the fastest route${extra > 0 ? `, ${extra} min longer` : ""}.`;
      if (count) text += ` Still passes ${plural(count, "milder reported spot")}, so stay alert.`;
    } else if (r === fastest) {
      text = count ? `Quickest, but passes ${plural(count, "reported spot")} (${cats}).` : "Quickest route.";
    } else {
      text = count ? `Alternative · ${plural(count, "reported spot")} (${cats}).` : "Alternative · no reported spots.";
    }
    r.reason = [text, helpText(r.help)].filter(Boolean).join(" ");
  }

  routes.sort((a, b) => (a === safest ? -1 : b === safest ? 1 : a.risk - b.risk || a.walkMin - b.walkMin));
  return { from, to, timeOfDay, routes };
}
