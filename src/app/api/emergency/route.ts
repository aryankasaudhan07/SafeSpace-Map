import { allow, senderHash } from "@/lib/abuse";
import { createAlert } from "@/lib/emergency";

export const dynamic = "force-dynamic";

/** Emergency button: raise an alert to the police and/or ambulance desks. */
export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const lat = Number(body?.lat);
  const lng = Number(body?.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
    return Response.json({ error: "We couldn't get your location. Call 112 now." }, { status: 400 });
  }
  if (!allow(`emergency:${senderHash(req)}`, 5, 3_600_000)) {
    return Response.json({ error: "Too many alerts from this device. Call 112 now." }, { status: 429 });
  }
  try {
    return Response.json(await createAlert({ ...body, lat, lng }));
  } catch (err) {
    console.error("emergency create failed", err);
    return Response.json({ error: "Couldn't send the alert. Call 112 now." }, { status: 500 });
  }
}
