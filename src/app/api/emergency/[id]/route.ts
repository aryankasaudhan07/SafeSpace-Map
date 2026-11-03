import { alertForCaller, cancelAlert } from "@/lib/emergency";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

const NO_STORE = { "Cache-Control": "no-store" };

function fail(result: "not_found" | "forbidden") {
  return Response.json(
    { error: result === "not_found" ? "Alert not found." : "Not allowed." },
    { status: result === "not_found" ? 404 : 403, headers: NO_STORE },
  );
}

/** The caller's phone polls this for status updates (secret in the x-alert-secret header). */
export async function GET(req: Request, { params }: Ctx) {
  const result = await alertForCaller((await params).id, req.headers.get("x-alert-secret") ?? "");
  if (typeof result === "string") return fail(result);
  return Response.json(result, { headers: NO_STORE });
}

/** "I'm safe now" */
export async function DELETE(req: Request, { params }: Ctx) {
  const result = await cancelAlert((await params).id, req.headers.get("x-alert-secret") ?? "");
  if (result !== "ok") return fail(result);
  return Response.json({ ok: true });
}
