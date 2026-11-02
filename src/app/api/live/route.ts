import { allow, senderHash } from "@/lib/abuse";
import { createShare, readPoint } from "@/lib/live";
import { LIVE_DURATIONS } from "@/lib/live-shared";

export const dynamic = "force-dynamic";

/** Starts a live location share. Returns the public link id and the secret only this phone keeps. */
export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const point = readPoint(body);
  if (!point) return Response.json({ error: "Set your location first." }, { status: 400 });

  if (!allow(`live:${senderHash(req)}`, 10, 3_600_000)) {
    return Response.json({ error: "Too many live shares started. Please try again later." }, { status: 429 });
  }

  const minutes = Number(body?.minutes) || LIVE_DURATIONS[1].minutes;
  try {
    return Response.json(await createShare(point, minutes));
  } catch (err) {
    console.error("live share create failed", err);
    return Response.json({ error: "Couldn't start live sharing. Please try again." }, { status: 500 });
  }
}
