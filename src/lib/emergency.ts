import { createHash, randomBytes } from "crypto";
import { supabase } from "./db";
import {
  cleanPhone,
  MAX_CONTACTS,
  SERVICE_KEYS,
  type AlertEvent,
  type CallBack,
  type Contact,
  type AlertStatus,
  type AlertStatusView,
  type ControlAlert,
  type NearestPlace,
  type Service,
} from "./emergency-shared";
import { viewShare } from "./live";
import { nearestOfKind } from "./places";

// Emergency alerts raised with the Emergency button and handled on the demo control-room dashboards.
// The caller's phone keeps a secret to read status and cancel; only its hash is stored.

interface StoredAlert {
  id: string;
  secretHash: string;
  createdAt: string;
  services: Service[];
  status: Partial<Record<Service, AlertStatus>>;
  events: AlertEvent[];
  name: string | null;
  phone: string | null;
  note: string | null;
  lat: number;
  lng: number;
  liveId: string | null;
  nearest: { police: NearestPlace | null; hospital: NearestPlace | null };
  cancelledAt: string | null;
  contacts: Contact[];
  callback: CallBack | null;
}

interface Row {
  id: string;
  secret_hash: string;
  created_at: string;
  services: Service[];
  status: Partial<Record<Service, AlertStatus>>;
  events: AlertEvent[] | null;
  name: string | null;
  phone: string | null;
  note: string | null;
  lat: number;
  lng: number;
  live_id: string | null;
  nearest: StoredAlert["nearest"] | null;
  cancelled_at: string | null;
  contacts: Contact[] | null;
  callback: CallBack | null;
}

const g = globalThis as typeof globalThis & { __alerts?: Map<string, StoredAlert> };
const mem = (g.__alerts ??= new Map<string, StoredAlert>());

const hash = (s: string) => createHash("sha256").update(s).digest("hex");

const fromRow = (r: Row): StoredAlert => ({
  id: r.id,
  secretHash: r.secret_hash,
  createdAt: r.created_at,
  services: r.services,
  status: r.status,
  events: r.events ?? [],
  name: r.name,
  phone: r.phone,
  note: r.note,
  lat: r.lat,
  lng: r.lng,
  liveId: r.live_id,
  nearest: r.nearest ?? { police: null, hospital: null },
  cancelledAt: r.cancelled_at,
  contacts: r.contacts ?? [],
  callback: r.callback ?? null,
});

const toRow = (a: StoredAlert): Row => ({
  id: a.id,
  secret_hash: a.secretHash,
  created_at: a.createdAt,
  services: a.services,
  status: a.status,
  events: a.events,
  name: a.name,
  phone: a.phone,
  note: a.note,
  lat: a.lat,
  lng: a.lng,
  live_id: a.liveId,
  nearest: a.nearest,
  cancelled_at: a.cancelledAt,
  contacts: a.contacts,
  callback: a.callback,
});

async function load(id: string): Promise<StoredAlert | null> {
  const db = supabase();
  if (!db) return mem.get(id) ?? null;
  const { data, error } = await db.from("emergencies").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  return data ? fromRow(data as Row) : null;
}

async function save(a: StoredAlert, isNew = false) {
  const db = supabase();
  if (!db) {
    mem.set(a.id, a);
    return;
  }
  const { error } = isNew ? await db.from("emergencies").insert(toRow(a)) : await db.from("emergencies").update(toRow(a)).eq("id", a.id);
  if (error) throw error;
}

function nearest(point: { lat: number; lng: number }, kind: "police" | "hospital"): NearestPlace | null {
  const p = nearestOfKind(point, kind);
  if (!p || p.distanceKm > 10) return null;
  return { name: p.name, lat: p.lat, lng: p.lng, distanceKm: Math.round(p.distanceKm * 100) / 100, ...(p.phone ? { phone: p.phone } : {}) };
}

export interface NewAlert {
  services: unknown;
  name: unknown;
  phone: unknown;
  note: unknown;
  lat: number;
  lng: number;
  liveId: unknown;
  contacts: unknown;
}

/** Up to MAX_CONTACTS contacts with valid-looking numbers. */
function cleanContacts(v: unknown): Contact[] {
  if (!Array.isArray(v)) return [];
  return v
    .map((c) => ({ name: String(c?.name ?? "").trim().slice(0, 30), phone: cleanPhone(c?.phone) }))
    .filter((c): c is Contact => !!c.phone)
    .slice(0, MAX_CONTACTS);
}

export async function createAlert(input: NewAlert) {
  const services = (Array.isArray(input.services) ? input.services : []).filter((s): s is Service => SERVICE_KEYS.includes(s as Service));
  const unique = [...new Set(services.length ? services : SERVICE_KEYS)];
  const now = new Date().toISOString();
  const secret = randomBytes(24).toString("base64url");
  const point = { lat: input.lat, lng: input.lng };
  const alert: StoredAlert = {
    id: randomBytes(9).toString("base64url"),
    secretHash: hash(secret),
    createdAt: now,
    services: unique,
    status: Object.fromEntries(unique.map((s) => [s, "new"])),
    events: unique.map((s) => ({ at: now, service: s, status: "new" as const })),
    name: String(input.name ?? "").trim().slice(0, 40) || null,
    phone: cleanPhone(input.phone),
    note: String(input.note ?? "").trim().slice(0, 300) || null,
    lat: input.lat,
    lng: input.lng,
    liveId: typeof input.liveId === "string" && /^[\w-]{6,40}$/.test(input.liveId) ? input.liveId : null,
    nearest: { police: nearest(point, "police"), hospital: nearest(point, "hospital") },
    cancelledAt: null,
    contacts: cleanContacts(input.contacts),
    callback: null,
  };
  await save(alert, true);
  return { id: alert.id, secret, services: alert.services, createdAt: alert.createdAt };
}

const statusView = (a: StoredAlert): AlertStatusView => ({
  id: a.id,
  createdAt: a.createdAt,
  services: a.services,
  status: a.status,
  cancelled: !!a.cancelledAt,
  events: a.events,
  callback: a.callback,
});

/** The caller's own view of their alert (needs the secret). */
export async function alertForCaller(id: string, secret: string): Promise<AlertStatusView | "not_found" | "forbidden"> {
  const a = await load(id);
  if (!a) return "not_found";
  if (a.secretHash !== hash(secret)) return "forbidden";
  return statusView(a);
}

/** "I'm safe now": the caller cancels their alert. */
export async function cancelAlert(id: string, secret: string): Promise<"ok" | "not_found" | "forbidden"> {
  const a = await load(id);
  if (!a) return "not_found";
  if (a.secretHash !== hash(secret)) return "forbidden";
  if (!a.cancelledAt) {
    const now = new Date().toISOString();
    await save({ ...a, cancelledAt: now, events: [...a.events, { at: now, service: "caller", status: "cancelled" }] });
  }
  return "ok";
}

async function toControl(a: StoredAlert): Promise<ControlAlert> {
  const live = a.liveId && !a.cancelledAt ? await viewShare(a.liveId).catch(() => null) : null;
  return {
    ...statusView(a),
    name: a.name,
    phone: a.phone,
    note: a.note,
    lat: a.lat,
    lng: a.lng,
    liveId: a.liveId,
    contacts: a.contacts,
    live: live?.status === "live" && live.last ? live.last : null,
    nearestPolice: a.nearest.police,
    nearestHospital: a.nearest.hospital,
  };
}

/** Alerts from the last 24 hours for one desk, newest first. */
export async function alertsFor(service: Service): Promise<ControlAlert[]> {
  const since = new Date(Date.now() - 24 * 3_600_000).toISOString();
  const db = supabase();
  let alerts: StoredAlert[];
  if (!db) {
    alerts = [...mem.values()].filter((a) => a.services.includes(service) && a.createdAt >= since);
  } else {
    const { data, error } = await db
      .from("emergencies")
      .select("*")
      .contains("services", [service])
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) throw error;
    alerts = (data as Row[]).map(fromRow);
  }
  alerts.sort((x, y) => y.createdAt.localeCompare(x.createdAt));
  return Promise.all(alerts.map(toControl));
}

/** A desk moves an alert to a new status. */
export async function setAlertStatus(id: string, service: Service, status: AlertStatus): Promise<"ok" | "not_found"> {
  const a = await load(id);
  if (!a || !a.services.includes(service)) return "not_found";
  if (a.status[service] === status) return "ok";
  const now = new Date().toISOString();
  await save({ ...a, status: { ...a.status, [service]: status }, events: [...a.events, { at: now, service, status }] });
  return "ok";
}

/** A desk is ringing the caller: the caller's app asks "Can you talk?". */
export async function startCallBack(id: string, service: Service): Promise<"ok" | "not_found"> {
  const a = await load(id);
  if (!a || !a.services.includes(service)) return "not_found";
  const now = new Date().toISOString();
  await save({ ...a, callback: { service, at: now, response: null }, events: [...a.events, { at: now, service, status: "calling" }] });
  return "ok";
}

/** The caller answers the call-back check in the app. */
export async function answerCallBack(id: string, secret: string, response: "ok" | "danger"): Promise<"ok" | "not_found" | "forbidden"> {
  const a = await load(id);
  if (!a || !a.callback) return "not_found";
  if (a.secretHash !== hash(secret)) return "forbidden";
  const now = new Date().toISOString();
  await save({
    ...a,
    callback: { ...a.callback, response, respondedAt: now },
    events: [...a.events, { at: now, service: "caller", status: response === "ok" ? "can_talk" : "cant_talk" }],
  });
  return "ok";
}
