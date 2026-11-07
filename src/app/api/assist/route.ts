import { adviseSituation } from "@/lib/assist";
import { AREA_RADIUS_KM, distanceKm } from "@/lib/geo";
import { nearbyPlaces } from "@/lib/places";
import { visibleReports } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const point = { lat: Number(body?.lat), lng: Number(body?.lng) };
  const situation = String(body?.situation ?? "").trim().slice(0, 1000);
  if (situation.length < 3) {
    return Response.json({ error: "Tell us briefly what is happening." }, { status: 400 });
  }

  // Without a location she still gets advice, just no nearby places.
  const located = Number.isFinite(point.lat) && Number.isFinite(point.lng);
  const places = located ? nearbyPlaces(point) : [];
  const reports = located ? (await visibleReports()).filter((r) => distanceKm(point, r) <= AREA_RADIUS_KM) : [];
  return Response.json({ advice: await adviseSituation(situation, places, reports) });
}
