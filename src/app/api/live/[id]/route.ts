import { allow } from "@/lib/abuse";
import { readPoint, stopShare, updateShare, viewShare, type LiveUpdateResult } from "@/lib/live";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

const NO_STORE = { "Cache-Control": "no-store" };

const ERRORS: Record<Exclude<LiveUpdateResult, "ok">, [string, number]> = {
  not_found: ["This live share doesn't exist.", 404],
  forbidden: ["Only the person sharing can change this.", 403],
  ended: ["Live sharing has ended.", 410],
};

function reply(result: LiveUpdateResult) {
  if (result === "ok") return Response.json({ ok: true });
  const [error, status] = ERRORS[result];
  return Response.json({ error }, { status });
}

/** Anyone with the link: current position and trail while live; just the status once it has ended. */
export async function GET(_req: Request, { params }: Ctx) {
  const view = await viewShare((await params).id);
  if (!view) return Response.json({ error: ERRORS.not_found[0] }, { status: 404, headers: NO_STORE });
  return Response.json(view, { headers: NO_STORE });
}

/** Sharer's phone: new position (also used as a heartbeat). */
export async function PATCH(req: Request, { params }: Ctx) {
  const { id } = await params;
  const body = await req.json().catch(() => null);
  const point = readPoint(body);
  if (!point || typeof body?.secret !== "string") return Response.json({ error: "Invalid update" }, { status: 400 });
  // At most one update a second per share.
  if (!allow(`live-update:${id}`, 60, 60_000)) return Response.json({ error: "Too many updates" }, { status: 429 });
  return reply(await updateShare(id, body.secret, point));
}

/** Sharer's phone: stop sharing and wipe the position. */
export async function DELETE(req: Request, { params }: Ctx) {
  const body = await req.json().catch(() => null);
  if (typeof body?.secret !== "string") return Response.json({ error: "Invalid request" }, { status: 400 });
  return reply(await stopShare((await params).id, body.secret));
}
