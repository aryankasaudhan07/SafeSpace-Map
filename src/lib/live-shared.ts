// Types and limits shared by the live-tracking API, the sharer's hook and the /track viewer page.

export interface LivePoint {
  lat: number;
  lng: number;
  /** GPS accuracy radius in metres, when the phone reports it */
  accuracy?: number;
  at: string;
}

export type LiveStatus = "live" | "stopped" | "expired";

/** What anyone with the link can see. Position and trail are only included while the share is live. */
export interface LiveView {
  status: LiveStatus;
  createdAt: string;
  expiresAt: string;
  last: LivePoint | null;
  trail: LivePoint[];
}

/** Sharing durations offered to the user, in minutes. */
export const LIVE_DURATIONS = [
  { minutes: 30, label: "30 min" },
  { minutes: 60, label: "1 hour" },
  { minutes: 240, label: "4 hours" },
] as const;

export const MAX_LIVE_MINUTES = 8 * 60;
/** How often the sharer's phone sends its position (also a heartbeat, so the viewer knows it's still online). */
export const LIVE_SEND_MS = 5000;
/** Older than this, the viewer warns the position may be out of date. */
export const LIVE_STALE_MS = 60_000;
