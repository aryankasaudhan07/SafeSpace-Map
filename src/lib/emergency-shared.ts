// Types and labels shared by the Emergency button, the alert API and the demo control-room dashboards.

export const SERVICES = {
  police: { label: "Police", desk: "Police control room", unit: "Police unit", color: "#1d4ed8" },
  ambulance: { label: "Ambulance", desk: "Ambulance dispatch", unit: "Ambulance", color: "#0d9488" },
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
  status: AlertStatus | "cancelled" | "calling" | "can_talk" | "cant_talk";
}

export interface NearestPlace {
  name: string;
  lat: number;
  lng: number;
  distanceKm: number;
  phone?: string;
}

export interface Contact {
  name: string;
  phone: string;
}

/** A desk rang the caller; the caller answers in the app whether they can talk. */
export interface CallBack {
  service: Service;
  at: string;
  response: "ok" | "danger" | null;
  respondedAt?: string;
}

/** With no answer in the app for this long, the desk sees "No answer". */
export const CALLBACK_TIMEOUT_MS = 60_000;

/** What the person who raised the alert sees. */
export interface AlertStatusView {
  id: string;
  createdAt: string;
  services: Service[];
  status: Partial<Record<Service, AlertStatus>>;
  cancelled: boolean;
  events: AlertEvent[];
  callback: CallBack | null;
}

/** What a control-room desk sees (passcode-protected). */
export interface ControlAlert extends AlertStatusView {
  name: string | null;
  phone: string | null;
  note: string | null;
  lat: number;
  lng: number;
  liveId: string | null;
  /** Family / friends the caller chose, so the desk can call them too */
  contacts: Contact[];
  /** Latest live position while the caller is still sharing */
  live: { lat: number; lng: number; accuracy?: number; at: string } | null;
  nearestPolice: NearestPlace | null;
  nearestHospital: NearestPlace | null;
}

export interface EmergencyProfile {
  name: string;
  phone: string;
  /** Emergency contacts sent with the alert (police can call them) */
  contacts?: Contact[];
}

export const MAX_CONTACTS = 3;

/** Keeps + and digits; null unless it looks like a phone number (8–15 digits). */
export function cleanPhone(v: unknown): string | null {
  const s = String(v ?? "").replace(/[^\d+]/g, "");
  const digits = s.replace(/\D/g, "");
  return digits.length >= 8 && digits.length <= 15 ? s : null;
}
