import { allow, senderHash } from "@/lib/abuse";
import { distanceKm } from "@/lib/geo";
import { safestRoutes } from "@/lib/route";
import { MAX_ROUTE_KM } from "@/lib/route-shared";
import { visibleReports } from "@/lib/store";

export const dynamic = "force-dynamic";

const point = (v: unknown) => {
  const p = v as { lat?: unknown; lng?: unknown } | null;
  const lat = Number(p?.lat);
  const lng = Number(p?.lng);
  return Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180 ? { lat, lng } : null;
};

/** POST {from, to, includeDemo} → walking routes scored by community reports, safest first. */
export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const from = point(body?.from);
  const to = point(body?.to);
  if (!from || !to) return Response.json({ error: "Choose where you're starting and where you're going." }, { status: 400 });

  const km = distanceKm(from, to);
  if (km < 0.05) return Response.json({ error: "Start and destination are the same place." }, { status: 400 });
  if (km > MAX_ROUTE_KM) {
    return Response.json({ error: `That's over ${MAX_ROUTE_KM} km: too far to walk. Take the metro or a verified cab.` }, { status: 400 });
  }
  if (!allow(`route:${senderHash(req)}`, 30, 600_000)) {
    return Response.json({ error: "Too many route searches. Please wait a few minutes." }, { status: 429 });
  }

  const reports = (await visibleReports()).filter((r) => body?.includeDemo !== false || !r.demo);
  const result = await safestRoutes(from, to, reports);
  if (!result) return Response.json({ error: "Couldn't find a walking route right now. Please try again." }, { status: 502 });
  return Response.json(result);
}
