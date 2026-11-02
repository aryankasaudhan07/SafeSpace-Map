import { nearbyPlaces } from "@/lib/places";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const point = { lat: Number(url.searchParams.get("lat")), lng: Number(url.searchParams.get("lng")) };
  if (!Number.isFinite(point.lat) || !Number.isFinite(point.lng)) {
    return Response.json({ error: "Invalid location" }, { status: 400 });
  }
  return Response.json({ places: nearbyPlaces(point) });
}
