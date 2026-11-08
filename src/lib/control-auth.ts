import { createHash, timingSafeEqual } from "crypto";
import { allow, senderHash } from "./abuse";

// The demo control-room dashboards show callers' phone numbers and locations, so they need a passcode
// (CONTROL_PASSCODE in .env.local / Vercel). Wrong guesses are rate-limited.

export type ControlAuth = "ok" | "unset" | "wrong" | "limited";

const digest = (s: string) => createHash("sha256").update(s).digest();

export function checkControl(req: Request): ControlAuth {
  const expected = process.env.CONTROL_PASSCODE;
  if (!expected) return "unset";
  const given = req.headers.get("x-control-passcode") ?? "";
  if (timingSafeEqual(digest(given), digest(expected))) return "ok";
  return allow(`control-fail:${senderHash(req)}`, 10, 600_000) ? "wrong" : "limited";
}

/** The passcode to print on the control pages while this is a public demo; HIDE_DEMO_PASSCODE=1 hides it again. */
export function demoPasscode(): string | null {
  return process.env.HIDE_DEMO_PASSCODE === "1" ? null : (process.env.CONTROL_PASSCODE ?? null);
}

export function controlError(auth: Exclude<ControlAuth, "ok">) {
  const messages = {
    unset: ["The control room isn't set up: add CONTROL_PASSCODE to the environment variables.", 503],
    wrong: ["Wrong passcode.", 401],
    limited: ["Too many wrong passcodes. Try again in 10 minutes.", 429],
  } as const;
  const [error, status] = messages[auth];
  return Response.json({ error }, { status, headers: { "Cache-Control": "no-store" } });
}
