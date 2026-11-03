import { checkControl, controlError } from "@/lib/control-auth";
import { alertsFor } from "@/lib/emergency";
import { SERVICE_KEYS, type Service } from "@/lib/emergency-shared";

export const dynamic = "force-dynamic";

/** Demo control-room desk: alerts for one service from the last 24 hours. */
export async function GET(req: Request) {
  const auth = checkControl(req);
  if (auth !== "ok") return controlError(auth);
  const service = new URL(req.url).searchParams.get("service") as Service;
  if (!SERVICE_KEYS.includes(service)) return Response.json({ error: "Unknown desk." }, { status: 400 });
  return Response.json({ alerts: await alertsFor(service) }, { headers: { "Cache-Control": "no-store" } });
}
