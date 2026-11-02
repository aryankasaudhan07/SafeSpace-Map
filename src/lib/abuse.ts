import { createHash } from "crypto";

/**
 * Anonymous but stable fingerprint of the sender (salted hash of IP + browser).
 * Used only for rate limits, one-vote-per-person and blocking self-confirmation; never shown or stored in plain form.
 */
export function senderHash(req: Request) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0].trim() || req.headers.get("x-real-ip") || "local";
  const ua = req.headers.get("user-agent") ?? "";
  const salt = process.env.FINGERPRINT_SALT || "safespace-map";
  return createHash("sha256").update(`${salt}|${ip}|${ua}`).digest("hex").slice(0, 32);
}

const hits = new Map<string, number[]>();

/** Sliding-window rate limit. Returns false when `key` already used `max` actions within `windowMs`. */
export function allow(key: string, max: number, windowMs: number) {
  const now = Date.now();
  const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
  if (recent.length >= max) {
    hits.set(key, recent);
    return false;
  }
  recent.push(now);
  hits.set(key, recent);
  return true;
}

const normalize = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();

/** True if `text` is (almost) the same as one of `previous` – copy-paste spam. */
export function isDuplicate(text: string, previous: string[]) {
  const n = normalize(text);
  return previous.some((p) => normalize(p) === n);
}
