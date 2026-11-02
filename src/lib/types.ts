export const CATEGORIES = {
  verbal_harassment: { label: "Verbal harassment / catcalling", short: "Verbal harassment", color: "#f59e0b" },
  stalking: { label: "Stalking / being followed", short: "Stalking", color: "#e11d48" },
  physical_harassment: { label: "Groping / physical harassment", short: "Physical harassment", color: "#9f1239" },
  poor_lighting: { label: "Poor or no street lighting", short: "Poor lighting", color: "#6366f1" },
  unsafe_transport: { label: "Unsafe transport / bus stop / cab", short: "Unsafe transport", color: "#0891b2" },
  isolated_area: { label: "Isolated / deserted area", short: "Isolated area", color: "#7c3aed" },
  other: { label: "Other safety concern", short: "Other", color: "#64748b" },
} as const;

export type Category = keyof typeof CATEGORIES;
export const CATEGORY_KEYS = Object.keys(CATEGORIES) as Category[];

export const TIMES = {
  morning: "Morning (6am–12pm)",
  afternoon: "Afternoon (12–5pm)",
  evening: "Evening (5–9pm)",
  night: "Night (9pm–6am)",
} as const;

export type TimeOfDay = keyof typeof TIMES;
export const TIME_KEYS = Object.keys(TIMES) as TimeOfDay[];

export interface Report {
  id: string;
  createdAt: string;
  lat: number;
  lng: number;
  category: Category;
  /** 1 (minor) – 5 (severe), assigned by AI triage */
  severity: number;
  /** Short AI-written title, free of personal details */
  title: string;
  /** Reporter's description with names / phone numbers redacted */
  description: string;
  timeOfDay: TimeOfDay;
  /** Seeded sample data shown so the map is not empty in demos */
  demo?: boolean;
  /** Community verification: "I've seen this too" / "Not accurate" votes */
  confirms?: number;
  disputes?: number;
}

export interface AreaSummary {
  count: number;
  level: "low" | "moderate" | "high";
  headline: string;
  summary: string;
  peakTimes: string;
  tips: string[];
  aiSource: "gemini" | "fallback";
  aiModel?: string;
}

export interface LatLng {
  lat: number;
  lng: number;
}
