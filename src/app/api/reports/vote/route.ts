import { allow, senderHash } from "@/lib/abuse";
import { castVote, visibleReports, type VoteKind } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const id = String(body?.id ?? "");
  const vote = body?.vote as VoteKind;
  if (!id || (vote !== "confirm" && vote !== "dispute")) {
    return Response.json({ error: "Invalid vote" }, { status: 400 });
  }

  const voter = senderHash(req);
  if (!allow(`vote:${voter}`, 30, 3_600_000)) {
    return Response.json({ error: "Too many votes. Please try again later." }, { status: 429 });
  }

  const result = await castVote(id, voter, vote);
  if (result === "not_found") return Response.json({ error: "Report not found" }, { status: 404 });
  if (result === "own_report") return Response.json({ error: "You can't verify your own report." }, { status: 403 });

  const report = (await visibleReports()).find((r) => r.id === id);
  // Not visible any more = the community has now disputed it enough to hide it.
  return Response.json({ confirms: report?.confirms ?? 0, disputes: report?.disputes ?? 0, hidden: !report });
}
