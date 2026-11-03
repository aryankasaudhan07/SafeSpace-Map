import { answerCallBack } from "@/lib/emergency";

export const dynamic = "force-dynamic";

/** Caller answers the call-back check: "ok" (I can talk) or "danger" (can't talk). */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const body = await req.json().catch(() => null);
  const response = body?.response;
  if (response !== "ok" && response !== "danger") return Response.json({ error: "Invalid answer." }, { status: 400 });
  const result = await answerCallBack((await params).id, req.headers.get("x-alert-secret") ?? "", response);
  if (result === "not_found") return Response.json({ error: "No call to answer." }, { status: 404 });
  if (result === "forbidden") return Response.json({ error: "Not allowed." }, { status: 403 });
  return Response.json({ ok: true });
}
