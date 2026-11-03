import { checkControl, controlError } from "@/lib/control-auth";
import { setAlertStatus } from "@/lib/emergency";
import { SERVICE_KEYS, STATUS_ORDER, type AlertStatus, type Service } from "@/lib/emergency-shared";

export const dynamic = "force-dynamic";

/** A desk acknowledges, dispatches or resolves an alert. */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = checkControl(req);
  if (auth !== "ok") return controlError(auth);
  const body = await req.json().catch(() => null);
  const service = body?.service as Service;
  const status = body?.status as AlertStatus;
  if (!SERVICE_KEYS.includes(service) || !STATUS_ORDER.includes(status)) {
    return Response.json({ error: "Invalid update." }, { status: 400 });
  }
  const result = await setAlertStatus((await params).id, service, status);
  if (result === "not_found") return Response.json({ error: "Alert not found." }, { status: 404 });
  return Response.json({ ok: true });
}
