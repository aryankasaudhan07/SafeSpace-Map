import { checkControl, controlError } from "@/lib/control-auth";
import { startCallBack } from "@/lib/emergency";
import { SERVICE_KEYS, type Service } from "@/lib/emergency-shared";

export const dynamic = "force-dynamic";

/** Desk taps "Call caller": the caller's app shows "Police is calling you" with can / can't talk buttons. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = checkControl(req);
  if (auth !== "ok") return controlError(auth);
  const body = await req.json().catch(() => null);
  const service = body?.service as Service;
  if (!SERVICE_KEYS.includes(service)) return Response.json({ error: "Invalid desk." }, { status: 400 });
  const result = await startCallBack((await params).id, service);
  if (result === "not_found") return Response.json({ error: "Alert not found." }, { status: 404 });
  return Response.json({ ok: true });
}
