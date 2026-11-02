import { createHash, randomBytes } from "crypto";
import { supabase } from "./db";
import { distanceKm } from "./geo";
import { MAX_LIVE_MINUTES, type LivePoint, type LiveStatus, type LiveView } from "./live-shared";

// Live location shares. The link id is public (anyone with it can watch); the secret is held only by the
// sharer's phone and is needed to move or stop the share. Only a hash of the secret is stored.

interface StoredShare {
  id: string;
  secretHash: string;
  createdAt: string;
  expiresAt: string;
  stoppedAt: string | null;
  last: LivePoint | null;
  trail: LivePoint[];
}

interface Row {
  id: string;
  secret_hash: string;
  created_at: string;
  expires_at: string;
  stopped_at: string | null;
  last: LivePoint | null;
  trail: LivePoint[] | null;
}

const TRAIL_MAX = 120;
/** A trail point is kept when the sharer has moved this far, or this long has passed, since the previous one. */
const TRAIL_MIN_KM = 0.015;
const TRAIL_MIN_MS = 60_000;

// Without Supabase, shares live in memory (fine for local dev; on Vercel each instance has its own memory).
// Kept on globalThis because each API route is bundled separately and would otherwise get its own map.
const g = globalThis as typeof globalThis & { __liveShares?: Map<string, StoredShare> };
const mem = (g.__liveShares ??= new Map<string, StoredShare>());

/** Parses {lat, lng, accuracy?} from a request body, or returns null. */
export function readPoint(body: unknown): Omit<LivePoint, "at"> | null {
  const b = body as { lat?: unknown; lng?: unknown; accuracy?: unknown } | null;
  const lat = Number(b?.lat);
  const lng = Number(b?.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  const accuracy = Number(b?.accuracy);
  return { lat, lng, ...(Number.isFinite(accuracy) && accuracy > 0 ? { accuracy: Math.round(accuracy) } : {}) };
}

const hash = (s: string) => createHash("sha256").update(s).digest("hex");

const fromRow = (r: Row): StoredShare => ({
  id: r.id,
  secretHash: r.secret_hash,
  createdAt: r.created_at,
  expiresAt: r.expires_at,
  stoppedAt: r.stopped_at,
  last: r.last,
  trail: r.trail ?? [],
});

function statusOf(s: StoredShare): LiveStatus {
  if (s.stoppedAt) return "stopped";
  return Date.now() > new Date(s.expiresAt).getTime() ? "expired" : "live";
}

async function load(id: string): Promise<StoredShare | null> {
  const db = supabase();
  if (!db) return mem.get(id) ?? null;
  const { data, error } = await db.from("live_shares").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  return data ? fromRow(data as Row) : null;
}

async function save(s: StoredShare, isNew = false) {
  const db = supabase();
  if (!db) {
    mem.set(s.id, s);
    return;
  }
  const row = {
    id: s.id,
    secret_hash: s.secretHash,
    created_at: s.createdAt,
    expires_at: s.expiresAt,
    stopped_at: s.stoppedAt,
    last: s.last,
    trail: s.trail,
  };
  const { error } = isNew ? await db.from("live_shares").insert(row) : await db.from("live_shares").update(row).eq("id", s.id);
  if (error) throw error;
}

function withPoint(s: StoredShare, p: LivePoint): StoredShare {
  const prev = s.trail[s.trail.length - 1];
  const keep = !prev || distanceKm(prev, p) >= TRAIL_MIN_KM || new Date(p.at).getTime() - new Date(prev.at).getTime() >= TRAIL_MIN_MS;
  return { ...s, last: p, trail: keep ? [...s.trail, p].slice(-TRAIL_MAX) : s.trail };
}

export async function createShare(point: Omit<LivePoint, "at">, minutes: number) {
  const now = new Date();
  const secret = randomBytes(24).toString("base64url");
  const mins = Math.min(Math.max(Math.round(minutes), 5), MAX_LIVE_MINUTES);
  const share = withPoint(
    {
      id: randomBytes(12).toString("base64url"),
      secretHash: hash(secret),
      createdAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + mins * 60_000).toISOString(),
      stoppedAt: null,
      last: null,
      trail: [],
    },
    { ...point, at: now.toISOString() },
  );
  await save(share, true);
  return { id: share.id, secret, expiresAt: share.expiresAt };
}

export type LiveUpdateResult = "ok" | "not_found" | "forbidden" | "ended";

async function authorised(id: string, secret: string): Promise<StoredShare | LiveUpdateResult> {
  const share = await load(id);
  if (!share) return "not_found";
  if (share.secretHash !== hash(secret)) return "forbidden";
  if (statusOf(share) !== "live") return "ended";
  return share;
}

export async function updateShare(id: string, secret: string, point: Omit<LivePoint, "at">): Promise<LiveUpdateResult> {
  const share = await authorised(id, secret);
  if (typeof share === "string") return share;
  await save(withPoint(share, { ...point, at: new Date().toISOString() }));
  return "ok";
}

/** Stopping also wipes the position, so the link no longer reveals where the sharer was. */
export async function stopShare(id: string, secret: string): Promise<LiveUpdateResult> {
  const share = await authorised(id, secret);
  if (share === "ended") return "ok";
  if (typeof share === "string") return share;
  await save({ ...share, stoppedAt: new Date().toISOString(), last: null, trail: [] });
  return "ok";
}

export async function viewShare(id: string): Promise<LiveView | null> {
  const share = await load(id);
  if (!share) return null;
  const status = statusOf(share);
  return {
    status,
    createdAt: share.createdAt,
    expiresAt: share.expiresAt,
    last: status === "live" ? share.last : null,
    trail: status === "live" ? share.trail : [],
  };
}
