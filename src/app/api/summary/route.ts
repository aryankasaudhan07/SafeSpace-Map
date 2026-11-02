import { AREA_RADIUS_KM, distanceKm } from "@/lib/geo";
import { findHotspots } from "@/lib/hotspots";
import { nearbyPlaces, nearestOfKind } from "@/lib/places";
import { visibleReports } from "@/lib/store";
import { summarizeArea } from "@/lib/summary";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const point = { lat: Number(body?.lat), lng: Number(body?.lng) };
  if (!Number.isFinite(point.lat) || !Number.isFinite(point.lng)) {
    return Response.json({ error: "Invalid location" }, { status: 400 });
  }

  const all = (await visibleReports()).filter((r) => body?.includeDemo !== false || !r.demo);
  const nearby = all
    .filter((r) => distanceKm(point, r) <= AREA_RADIUS_KM)
    .sort((a, b) => b.severity - a.severity);

  const police = nearbyPlaces(point).filter((p) => p.kind === "police");
  const hotspots = findHotspots(point, all).map((h) => {
    const metro = nearestOfKind(h, "metro");
    return { ...h, near: metro && metro.distanceKm < 1.5 ? metro.name : undefined };
  });

  const summary = nearby.length ? await summarizeArea(nearby) : null;
  return Response.json({ summary, police, hotspots });
}
