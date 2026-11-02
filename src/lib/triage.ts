import { generateJson, hasGemini } from "./gemini";
import { CATEGORIES, CATEGORY_KEYS, TIMES, type Category, type TimeOfDay } from "./types";

export interface TriageResult {
  valid: boolean;
  rejectionReason: string;
  category: Category;
  severity: number;
  title: string;
  description: string;
  aiSource: "gemini" | "fallback";
  aiModel?: string;
}

const SCHEMA = {
  type: "OBJECT",
  properties: {
    is_valid: { type: "BOOLEAN" },
    rejection_reason: { type: "STRING" },
    category: { type: "STRING", enum: CATEGORY_KEYS },
    severity: { type: "INTEGER" },
    title: { type: "STRING" },
    redacted_description: { type: "STRING" },
  },
  required: ["is_valid", "rejection_reason", "category", "severity", "title", "redacted_description"],
};

export async function triageReport(description: string, timeOfDay: TimeOfDay): Promise<TriageResult> {
  if (hasGemini()) {
    try {
      return await geminiTriage(description, timeOfDay);
    } catch (err) {
      console.error("Gemini triage failed, using fallback:", err);
    }
  }
  return fallbackTriage(description);
}

async function geminiTriage(description: string, timeOfDay: TimeOfDay): Promise<TriageResult> {
  const categoryList = CATEGORY_KEYS.map((k) => `- ${k}: ${CATEGORIES[k].label}`).join("\n");
  const prompt = `You moderate and triage anonymous public-safety reports for a women's safety map of Indian cities.
Reports may be in English, Hindi or Hinglish.

Report (time of day: ${TIMES[timeOfDay]}):
"""
${description}
"""

Tasks:
1. is_valid: false if ANY of these apply, otherwise true:
   - spam, a test message, an advertisement, gibberish, or not about personal safety in a physical place
   - it accuses or targets a specific identifiable person, shop, restaurant, business or institution by name (e.g. "the owner of XYZ cafe is a molester") – we map unsafe places and patterns, never accuse people or businesses
   - it reads as revenge, a joke, a rumour/forward ("I heard that…", "share this"), or a clearly fictional or exaggerated story
   - it calls for violence, vigilantism or harassment of anyone, or contains hate speech against a community
   If false, give a short, polite rejection_reason telling the user what to change; else rejection_reason is "".
2. category: the single best category from:
${categoryList}
3. severity: integer 1-5.
   1 = minor discomfort, 2 = unsafe infrastructure (dark road, deserted area),
   3 = verbal harassment / catcalling / intimidation,
   4 = stalking, being followed, groping or any unwanted physical contact, unsafe cab/driver behaviour,
   5 = physical assault, violence, weapon, or attempted abduction.
4. title: a neutral English title of at most 8 words describing the incident type and place (if a place is mentioned). No personal names.
5. redacted_description: the original description in its original language, with personal names, phone numbers, email addresses and social media handles replaced by [redacted]. Keep places, bus routes and landmarks. Do not add anything.`;

  const { data: r, model } = await generateJson<{
    is_valid: boolean;
    rejection_reason: string;
    category: string;
    severity: number;
    title: string;
    redacted_description: string;
  }>(prompt, SCHEMA);

  return {
    valid: r.is_valid,
    rejectionReason: r.rejection_reason,
    category: (CATEGORY_KEYS as string[]).includes(r.category) ? (r.category as Category) : "other",
    severity: Math.min(5, Math.max(1, Math.round(r.severity || 3))),
    title: r.title.slice(0, 80) || CATEGORIES.other.short,
    description: r.redacted_description || description,
    aiSource: "gemini",
    aiModel: model,
  };
}

const KEYWORDS: [Category, RegExp, number][] = [
  ["physical_harassment", /grop|touch|grab|push|molest|assault|chhed|chhu/i, 5],
  ["stalking", /follow|stalk|peecha|waited for me|tracking/i, 4],
  ["verbal_harassment", /comment|catcall|whistl|lewd|abuse|remark|taunt/i, 3],
  ["unsafe_transport", /cab|auto|bus|metro|driver|uber|ola|rickshaw|stop/i, 3],
  ["poor_lighting", /light|dark|andhera|lamp/i, 2],
  ["isolated_area", /deserted|isolated|empty|sunsaan|lonely|no one/i, 2],
];

/** Keyword-based triage used when no Gemini key is set or the API call fails. */
export function fallbackTriage(description: string): TriageResult {
  const text = description.trim();
  const valid = text.length >= 15 && /[a-zऀ-ॿ]{3,}/i.test(text);
  const match = KEYWORDS.find(([, re]) => re.test(text));
  const category = match?.[0] ?? "other";
  return {
    valid,
    rejectionReason: valid ? "" : "Please describe what happened in a little more detail.",
    category,
    severity: match?.[2] ?? 2,
    title: CATEGORIES[category].short,
    description: text
      .replace(/(\+?91[\s-]?)?[6-9]\d{9}/g, "[redacted]")
      .replace(/\S+@\S+\.\S+/g, "[redacted]")
      .replace(/@\w{3,}/g, "[redacted]"),
    aiSource: "fallback",
  };
}
