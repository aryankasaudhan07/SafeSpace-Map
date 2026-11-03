// Types and labels shared by the Emergency button, the alert API and the demo control-room dashboards.

export const SERVICES = {
  police: { label: "Police", desk: "Police control room", unit: "Police unit", color: "#1d4ed8" },
  ambulance: { label: "Ambulance", desk: "Ambulance dispatch", unit: "Ambulance", color: "#dc2626" },
} as const;

export type Service = keyof typeof SERVICES;
export const SERVICE_KEYS = Object.keys(SERVICES) as Service[];

/** new → seen (acknowledged) → dispatched → resolved */
export type AlertStatus = "new" | "seen" | "dispatched" | "resolved";
export const STATUS_ORDER: AlertStatus[] = ["new", "seen", "dispatched", "resolved"];

export const STATUS_LABEL: Record<Service, Record<AlertStatus, string>> = {
  police: { new: "Alert sent", seen: "Seen by control room", dispatched: "Police unit on the way", resolved: "Resolved" },
  ambulance: { new: "Alert sent", seen: "Seen by dispatch", dispatched: "Ambulance on the way", resolved: "Resolved" },
};

/** Button text on the dashboard for moving an alert to its next status. */
export const NEXT_ACTION: Record<Service, Partial<Record<AlertStatus, string>>> = {
  police: { new: "Acknowledge", seen: "Dispatch police unit", dispatched: "Mark resolved" },
  ambulance: { new: "Acknowledge", seen: "Dispatch ambulance", dispatched: "Mark resolved" },
};

export interface AlertEvent {
  at: string;
  service: Service | "caller";
  status: AlertStatus | "cancelled";
}

export interface NearestPlace {
  name: string;
  lat: number;
  lng: number;
  distanceKm: number;
  phone?: string;
}

/** What the person who raised the alert sees. */
export interface AlertStatusView {
  id: string;
  createdAt: string;
  services: Service[];
  status: Partial<Record<Service, AlertStatus>>;
  cancelled: boolean;
  events: AlertEvent[];
}

/** What a control-room desk sees (passcode-protected). */
export interface ControlAlert extends AlertStatusView {
  name: string | null;
  phone: string | null;
  note: string | null;
  lat: number;
  lng: number;
  liveId: string | null;
  /** Latest live position while the caller is still sharing */
  live: { lat: number; lng: number; accuracy?: number; at: string } | null;
  nearestPolice: NearestPlace | null;
  nearestHospital: NearestPlace | null;
}

export interface EmergencyProfile {
  name: string;
  phone: string;
  contacts: { name: string; phone: string }[];
}

export const MAX_CONTACTS = 5;

/** Keeps + and digits; null unless it looks like a phone number (8–15 digits). */
export function cleanPhone(v: unknown): string | null {
  const s = String(v ?? "").replace(/[^\d+]/g, "");
  const digits = s.replace(/\D/g, "");
  return digits.length >= 8 && digits.length <= 15 ? s : null;
}
