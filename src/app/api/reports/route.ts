import { allow, isDuplicate, senderHash } from "@/lib/abuse";
import { hasGemini } from "@/lib/gemini";
import { placeCount } from "@/lib/places";
import { addReport, recentDescriptions, storageMode, visibleReports } from "@/lib/store";
import { triageReport } from "@/lib/triage";
import { TIME_KEYS, type TimeOfDay } from "@/lib/types";

export const dynamic = "force-dynamic";

const HOUR = 3_600_000;

export async function GET() {
  try {
    return Response.json({
      reports: await visibleReports(),
      ai: hasGemini() ? "gemini" : "fallback",
      storage: storageMode(),
      places: placeCount,
    });
  } catch (err) {
    console.error(err);
    return Response.json({ error: "Could not load reports" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const lat = Number(body?.lat);
  const lng = Number(body?.lng);
  const description = String(body?.description ?? "").trim();
  const timeOfDay = body?.timeOfDay as TimeOfDay;

  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
    return Response.json({ error: "Please choose a location on the map." }, { status: 400 });
  }
  if (description.length < 10 || description.length > 1000) {
    return Response.json({ error: "Description must be 10–1000 characters." }, { status: 400 });
  }
  if (!TIME_KEYS.includes(timeOfDay)) {
    return Response.json({ error: "Please choose a time of day." }, { status: 400 });
  }

  // Anti-flooding: a few reports per device per hour, and no copy-paste repeats.
  const sender = senderHash(req);
  if (!allow(`report:${sender}`, 5, HOUR)) {
    return Response.json({ error: "You've sent several reports recently. Please try again in a while." }, { status: 429 });
  }
  if (isDuplicate(description, await recentDescriptions(24 * HOUR))) {
    return Response.json({ rejected: true, error: "This exact report was already submitted." }, { status: 422 });
  }

  const triage = await triageReport(description, timeOfDay);
  if (!triage.valid) {
    return Response.json(
      { rejected: true, error: triage.rejectionReason || "This doesn't look like a safety report." },
      { status: 422 },
    );
  }

  try {
    const report = await addReport(
      {
        lat,
        lng,
        description: triage.description,
        timeOfDay,
        category: triage.category,
        severity: triage.severity,
        title: triage.title,
      },
      sender,
    );
    return Response.json({ report: { ...report, confirms: 0, disputes: 0 }, aiSource: triage.aiSource, aiModel: triage.aiModel });
  } catch (err) {
    console.error(err);
    return Response.json({ error: "Could not save the report. Please try again." }, { status: 500 });
  }
}
