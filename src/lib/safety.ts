// Shared (client + server) safety data: emergency numbers and safe-place kinds.
import type { IconName } from "./icons";

export const HELPLINES = [
  { number: "112", label: "Emergency", detail: "Police, fire, ambulance – all India" },
  { number: "1091", label: "Women Helpline", detail: "Delhi Police, 24×7" },
  { number: "181", label: "Women in distress", detail: "Govt. of India, 24×7" },
  { number: "102", label: "Ambulance", detail: "Medical emergency" },
  { number: "155370", label: "Delhi Metro (DMRC)", detail: "Help inside metro / stations" },
] as const;

export type HelplineNumber = (typeof HELPLINES)[number]["number"];

export const PLACE_KINDS = {
  police: { label: "Police stations", single: "Police station", icon: "police" as IconName, color: "#1d4ed8" },
  hospital: { label: "Hospitals", single: "Hospital", icon: "hospital" as IconName, color: "#dc2626" },
  metro: { label: "Metro stations (CISF guarded)", single: "Metro station", icon: "metro" as IconName, color: "#7c3aed" },
  fuel: { label: "Petrol pumps (staffed, often 24×7)", single: "Petrol pump", icon: "fuel" as IconName, color: "#d97706" },
} as const;

export type PlaceKind = keyof typeof PLACE_KINDS;

export interface SafePlace {
  id: string;
  kind: PlaceKind;
  name: string;
  lat: number;
  lng: number;
  phone?: string;
  open24?: boolean;
}

export interface NearbyPlace extends SafePlace {
  distanceKm: number;
  walkMin: number;
}

export interface AssistAdvice {
  urgency: "emergency" | "urgent" | "caution";
  headline: string;
  steps: string[];
  callNumber: HelplineNumber | null;
  goTo: NearbyPlace | null;
  goToReason: string;
  reassurance: string;
  aiSource: "gemini" | "fallback";
  aiModel?: string;
}

export function directionsUrl(p: { lat: number; lng: number }) {
  return `https://www.google.com/maps/dir/?api=1&destination=${p.lat},${p.lng}&travelmode=walking`;
}
