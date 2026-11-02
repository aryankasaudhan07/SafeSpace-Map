import { ttlCache } from "./cache";
import { generateJson, hasGemini } from "./gemini";
import { trustStatus, trustWeight } from "./trust";
import { CATEGORIES, TIMES, type AreaSummary, type Category, type Report, type TimeOfDay } from "./types";

const SCHEMA = {
  type: "OBJECT",
  properties: {
    level: { type: "STRING", enum: ["low", "moderate", "high"] },
    headline: { type: "STRING" },
    summary: { type: "STRING" },
    peak_times: { type: "STRING" },
    tips: { type: "ARRAY", items: { type: "STRING" } },
  },
  required: ["level", "headline", "summary", "peak_times", "tips"],
};

// Keyed by the exact set of reports, so a new report in the area refreshes the summary.
const cache = ttlCache<AreaSummary>(30 * 60_000);

export async function summarizeArea(reports: Report[]): Promise<AreaSummary> {
  if (hasGemini()) {
    const key = reports.map((r) => r.id).sort().join(",");
    const cached = cache.get(key);
    if (cached) return cached;
    try {
      const summary = await geminiSummary(reports);
      cache.set(key, summary);
      return summary;
    } catch (err) {
      console.error("Gemini summary failed, using fallback:", err);
    }
  }
  return fallbackSummary(reports);
}

async function geminiSummary(reports: Report[]): Promise<AreaSummary> {
  const lines = reports
    .slice(0, 40)
    .map(
      (r) =>
        `- [${CATEGORIES[r.category].short}, severity ${r.severity}/5, ${TIMES[r.timeOfDay]}, ${trustStatus(r)}${r.confirms ? ` (confirmed by ${r.confirms})` : ""}] ${r.description.slice(0, 200)}`,
    )
    .join("\n");

  const prompt = `You write short, calm, practical safety briefings for a women's safety map.
Below are ${reports.length} anonymous reports within 1 km of a point the user selected.

${lines}

Return:
- level: "low", "moderate" or "high" overall risk, based on how many reports there are, how severe, and how well verified. Reports are anonymous: give community-confirmed reports more weight than unverified ones, and never call an area "high" risk on a single unverified report.
- headline: one line, at most 12 words.
- summary: 2-3 sentences on the main patterns (what kind of incidents, which spots, which times). Do not invent details beyond the reports. Do not be alarmist.
- peak_times: one short phrase naming when incidents cluster (e.g. "Evenings after 7pm").
- tips: exactly 3 short, specific, actionable safety tips for this area.`;

  const { data: r, model } = await generateJson<{
    level: AreaSummary["level"];
    headline: string;
    summary: string;
    peak_times: string;
    tips: string[];
  }>(prompt, SCHEMA);

  return {
    count: reports.length,
    level: r.level,
    headline: r.headline,
    summary: r.summary,
    peakTimes: r.peak_times,
    tips: r.tips.slice(0, 3),
    aiSource: "gemini",
    aiModel: model,
  };
}

const TIPS: Record<Category, string> = {
  verbal_harassment: "Stay near shops or groups of people and report harassment on 112 if it escalates.",
  stalking: "If you feel followed, walk into a shop or crowded place and call someone you trust.",
  physical_harassment: "Avoid the most crowded boarding points and use women's coaches or seats where available.",
  poor_lighting: "Prefer well-lit main roads over shortcuts, especially after dark.",
  unsafe_transport: "Share your live trip with a contact and check the vehicle number before boarding.",
  isolated_area: "Avoid walking alone through this stretch late; take a cab or go with someone.",
  other: "Keep your phone charged and share your location with someone you trust.",
};

function topKeys<K extends string>(counts: Record<string, number>): K[] {
  return (Object.entries(counts) as [K, number][]).sort((a, b) => b[1] - a[1]).map(([k]) => k);
}

/** Rule-based summary used when no Gemini key is set or the API call fails. */
export function fallbackSummary(reports: Report[]): AreaSummary {
  const byCat: Record<string, number> = {};
  const byTime: Record<string, number> = {};
  for (const r of reports) {
    byCat[r.category] = (byCat[r.category] ?? 0) + 1;
    byTime[r.timeOfDay] = (byTime[r.timeOfDay] ?? 0) + 1;
  }
  const cats = topKeys<Category>(byCat);
  const peak = topKeys<TimeOfDay>(byTime)[0];
  const avg = reports.reduce((s, r) => s + r.severity, 0) / reports.length;
  // Unverified reports count for less, so one fake report can't make an area "high risk".
  const score = reports.reduce((s, r) => s + r.severity * trustWeight(r), 0);
  const level = score >= 18 ? "high" : score >= 6 ? "moderate" : "low";

  return {
    count: reports.length,
    level,
    headline: `${reports.length} report${reports.length === 1 ? "" : "s"} nearby, mostly ${CATEGORIES[cats[0]].short.toLowerCase()}`,
    summary: `Reports within 1 km mainly involve ${cats
      .slice(0, 2)
      .map((c) => CATEGORIES[c].short.toLowerCase())
      .join(" and ")}. Average severity is ${avg.toFixed(1)} out of 5.`,
    peakTimes: TIMES[peak],
    tips: [...cats.slice(0, 3).map((c) => TIPS[c]), TIPS.other, TIPS.isolated_area].slice(0, 3),
    aiSource: "fallback",
  };
}
