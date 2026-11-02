import { ttlCache } from "@/lib/cache";

export const dynamic = "force-dynamic";

// Place search for the route destination, via Photon (OpenStreetMap data, built for search-as-you-type).
// Limited to the Delhi NCR area and cached, so we stay a light user of the free service.
const PHOTON = "https://photon.komoot.io/api/";
const BBOX = "76.84,28.40,77.55,28.88";
const cache = ttlCache<Place[]>(24 * 3_600_000, 2000);

interface Place {
  name: string;
  detail: string;
  lat: number;
  lng: number;
}

interface Feature {
  geometry: { coordinates: [number, number] };
  properties: { name?: string; street?: string; district?: string; locality?: string; city?: string; state?: string };
}

export async function GET(req: Request) {
  const q = (new URL(req.url).searchParams.get("q") ?? "").trim().slice(0, 80);
  if (q.length < 3) return Response.json({ places: [] });

  const key = q.toLowerCase();
  const hit = cache.get(key);
  if (hit) return Response.json({ places: hit });

  try {
    const url = `${PHOTON}?q=${encodeURIComponent(q)}&limit=6&lat=28.6139&lon=77.209&bbox=${BBOX}&lang=en`;
    const res = await fetch(url, {
      headers: { "User-Agent": "SafeSpaceMap/1.0 (hackathon prototype; github.com/aryankasaudhan07/SafeSpace-Map)" },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) throw new Error(`photon ${res.status}`);
    const data = (await res.json()) as { features?: Feature[] };
    const seen = new Set<string>();
    const places = (data.features ?? [])
      .map((f) => {
        const p = f.properties;
        const name = p.name ?? p.street ?? "";
        const detail = [p.locality ?? p.district, p.city ?? p.state].filter(Boolean).join(", ");
        return { name, detail, lat: f.geometry.coordinates[1], lng: f.geometry.coordinates[0] };
      })
      .filter((p) => p.name && !seen.has(`${p.name}|${p.detail}`) && seen.add(`${p.name}|${p.detail}`));
    cache.set(key, places);
    return Response.json({ places });
  } catch {
    return Response.json({ places: [], error: "Place search is unavailable. Tap the map to choose instead." });
  }
}
