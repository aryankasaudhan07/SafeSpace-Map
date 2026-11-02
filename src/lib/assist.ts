import { generateJson, hasGemini } from "./gemini";
import { HELPLINES, PLACE_KINDS, type AssistAdvice, type HelplineNumber, type NearbyPlace } from "./safety";
import { CATEGORIES, type Report } from "./types";

const NUMBERS = HELPLINES.map((h) => h.number);

const SCHEMA = {
  type: "OBJECT",
  properties: {
    urgency: { type: "STRING", enum: ["emergency", "urgent", "caution"] },
    headline: { type: "STRING" },
    steps: { type: "ARRAY", items: { type: "STRING" } },
    call_number: { type: "STRING", enum: [...NUMBERS, "none"] },
    go_to_place_id: { type: "STRING" },
    go_to_reason: { type: "STRING" },
    reassurance: { type: "STRING" },
  },
  required: ["urgency", "headline", "steps", "call_number", "go_to_place_id", "go_to_reason", "reassurance"],
};

export async function adviseSituation(situation: string, places: NearbyPlace[], reports: Report[]): Promise<AssistAdvice> {
  if (hasGemini()) {
    try {
      return await geminiAdvice(situation, places, reports);
    } catch (err) {
      console.error("Gemini assist failed, using fallback:", err);
    }
  }
  return fallbackAdvice(situation, places);
}

function istTime() {
  return new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata", weekday: "short", hour: "numeric", minute: "2-digit" });
}

async function geminiAdvice(situation: string, places: NearbyPlace[], reports: Report[]): Promise<AssistAdvice> {
  const placeLines = places.length
    ? places
        .map((p) => `- id=${p.id} | ${PLACE_KINDS[p.kind].single}: ${p.name} | ${p.distanceKm} km (~${p.walkMin} min walk)${p.open24 ? " | open 24×7" : ""}`)
        .join("\n")
    : "(no known places nearby)";

  const reportCounts: Record<string, number> = {};
  for (const r of reports) {
    const key = CATEGORIES[r.category].short;
    reportCounts[key] = (reportCounts[key] ?? 0) + 1;
  }
  const reportLine = reports.length
    ? `${reports.length} past safety reports within 1 km: ${Object.entries(reportCounts).map(([k, v]) => `${k} (${v})`).join(", ")}`
    : "No past safety reports within 1 km.";

  const prompt = `You are a calm, practical personal-safety assistant for women in Delhi, India. A user near you needs help right now.
Current time: ${istTime()} IST.

User's situation (may be English, Hindi or Hinglish):
"""
${situation}
"""

Nearby safe places (real, with walking distance):
${placeLines}

Area context: ${reportLine}

Helplines: 112 = all-India emergency (police/ambulance), 1091 = Delhi Police women helpline, 181 = women in distress helpline, 102 = ambulance.

Respond with:
- urgency: "emergency" if there is immediate danger to her body or life (attack, being grabbed, weapon, forced into vehicle, injured), "urgent" if a threat is developing (being followed, harassed, cab going off-route, stranded alone at night), else "caution".
- headline: one short line telling her the single most important thing to do now.
- steps: 3 to 5 short, concrete, imperative steps in order. Use the actual place names and distances from the list. Prefer moving towards people and light. Never suggest confronting anyone.
- call_number: the one helpline she should call now, or "none" if not needed.
- go_to_place_id: the id of the best place to head to from the list (closest staffed safe place; a nearby metro station or petrol pump is fine if the police station is far). Use "" if the list is empty.
- go_to_reason: one short sentence on why that place.
- reassurance: one short, warm sentence.
Write headline, steps, go_to_reason and reassurance in the same language and script the user wrote in.`;

  const { data: r, model } = await generateJson<{
    urgency: AssistAdvice["urgency"];
    headline: string;
    steps: string[];
    call_number: string;
    go_to_place_id: string;
    go_to_reason: string;
    reassurance: string;
  }>(prompt, SCHEMA);

  return {
    urgency: r.urgency,
    headline: r.headline,
    steps: r.steps.slice(0, 5),
    callNumber: (NUMBERS as string[]).includes(r.call_number) ? (r.call_number as HelplineNumber) : null,
    goTo: places.find((p) => p.id === r.go_to_place_id) ?? places.find((p) => p.kind === "police") ?? places[0] ?? null,
    goToReason: r.go_to_reason,
    reassurance: r.reassurance,
    aiSource: "gemini",
    aiModel: model,
  };
}

const EMERGENCY = /attack|grab|knife|gun|weapon|hit|hurt|bleed|kidnap|forc|rape|assault|pakad|maar|bachao|help me/i;
const URGENT = /follow|stalk|peecha|harass|touch|cab|auto|driver|route|alone|akeli|stranded|night|drunk|comment/i;

/** Rule-based advice used when Gemini is unavailable. */
export function fallbackAdvice(situation: string, places: NearbyPlace[]): AssistAdvice {
  const urgency = EMERGENCY.test(situation) ? "emergency" : URGENT.test(situation) ? "urgent" : "caution";
  const police = places.find((p) => p.kind === "police");
  const nearestStaffed = places.find((p) => p.kind !== "hospital");
  // Head for the police station unless something staffed is much closer.
  const goTo = police && (!nearestStaffed || police.distanceKm <= nearestStaffed.distanceKm + 0.8) ? police : nearestStaffed ?? police ?? null;

  const steps = [
    urgency === "emergency" ? "Call 112 now and keep the call on." : "Call 1091 (Delhi Police women helpline) or someone you trust.",
    "Move towards a busy, well-lit place with people around.",
    goTo ? `Head to ${goTo.name} (${goTo.distanceKm} km, about ${goTo.walkMin} min walk).` : "Go into the nearest open shop, restaurant or office.",
    "Share your live location with a trusted contact.",
  ];

  return {
    urgency,
    headline: urgency === "emergency" ? "Call 112 and get to people right away." : "Move to a safe, busy place and alert someone.",
    steps,
    callNumber: urgency === "emergency" ? "112" : urgency === "urgent" ? "1091" : null,
    goTo,
    goToReason: goTo ? `Closest staffed safe place.` : "",
    reassurance: "You are doing the right thing by asking for help.",
    aiSource: "fallback",
  };
}
