"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { LIVE_SEND_MS } from "./live-shared";
import type { LatLng } from "./types";

interface Session {
  id: string;
  secret: string;
  expiresAt: string;
  /** Last known position, so heartbeats continue after a reload even before (or without) GPS */
  point?: { lat: number; lng: number; accuracy?: number };
}

export interface LiveShare {
  session: Session | null;
  url: string | null;
  starting: boolean;
  error: string | null;
  /** GPS is following the phone (false = sharing a fixed point set on the map) */
  following: boolean;
  lastSentAt: number | null;
  /** Starts sharing; resolves to the link to send, or null (see `error`). */
  start: (minutes: number, fallback: LatLng | null, known?: LatLng) => Promise<{ url: string; expiresAt: string } | null>;
  stop: () => Promise<void>;
}

const STORAGE_KEY = "safespace-live";

function loadSession(): Session | null {
  try {
    const s = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null") as Session | null;
    return s && new Date(s.expiresAt).getTime() > Date.now() ? s : null;
  } catch {
    return null;
  }
}

function saveSession(s: Session | null) {
  try {
    if (s) localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    // storage blocked: sharing still works until the page is closed
  }
}

function currentPosition(): Promise<GeolocationPosition | null> {
  return new Promise((resolve) => {
    if (!navigator.geolocation) return resolve(null);
    navigator.geolocation.getCurrentPosition(resolve, () => resolve(null), { enableHighAccuracy: true, timeout: 10000 });
  });
}

/**
 * Live location sharing from this phone: creates a share, follows GPS and sends the position every few seconds
 * (also a heartbeat), keeps the screen awake, survives a page reload and stops itself when time runs out.
 */
export function useLiveShare(onMove: (p: LatLng) => void): LiveShare {
  const [session, setSession] = useState<Session | null>(null);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [following, setFollowing] = useState(false);
  const [lastSentAt, setLastSentAt] = useState<number | null>(null);
  const latest = useRef<{ lat: number; lng: number; accuracy?: number } | null>(null);
  const onMoveRef = useRef(onMove);
  onMoveRef.current = onMove;

  useEffect(() => setSession(loadSession()), []);

  const end = useCallback(() => {
    saveSession(null);
    setSession(null);
    setFollowing(false);
    setLastSentAt(null);
    latest.current = null;
  }, []);

  // While a session is active: follow GPS, send updates, keep the screen on, stop at expiry.
  useEffect(() => {
    if (!session) return;
    latest.current ??= session.point ?? null;
    let watchId: number | null = null;
    let wakeLock: { release: () => Promise<void> } | null = null;

    if (navigator.geolocation) {
      watchId = navigator.geolocation.watchPosition(
        (pos) => {
          const p = { lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy };
          latest.current = p;
          saveSession({ ...session, point: p });
          setFollowing(true);
          onMoveRef.current({ lat: p.lat, lng: p.lng });
        },
        () => setFollowing(false),
        { enableHighAccuracy: true, maximumAge: 5000 },
      );
    }

    async function send() {
      if (!session) return;
      if (Date.now() > new Date(session.expiresAt).getTime()) return end();
      if (!latest.current) return;
      try {
        const res = await fetch(`/api/live/${session.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...latest.current, secret: session.secret }),
        });
        if (res.status === 404 || res.status === 403 || res.status === 410) return end();
        if (res.ok) setLastSentAt(Date.now());
      } catch {
        // offline for a moment: the next tick retries
      }
    }

    async function keepAwake() {
      try {
        const nav = navigator as Navigator & { wakeLock?: { request: (t: "screen") => Promise<{ release: () => Promise<void> }> } };
        if (document.visibilityState === "visible") wakeLock = (await nav.wakeLock?.request("screen")) ?? null;
      } catch {
        // not supported or refused
      }
    }
    keepAwake();
    // The browser drops the wake lock when the tab is hidden; take it again when the user comes back.
    const onVisible = () => {
      if (document.visibilityState === "visible") {
        keepAwake();
        send();
      }
    };
    document.addEventListener("visibilitychange", onVisible);

    const timer = setInterval(send, LIVE_SEND_MS);
    send();

    return () => {
      clearInterval(timer);
      if (watchId !== null) navigator.geolocation.clearWatch(watchId);
      document.removeEventListener("visibilitychange", onVisible);
      wakeLock?.release().catch(() => {});
    };
  }, [session, end]);

  /** `known`: a position the caller just got, so we don't wait for GPS a second time (e.g. the Emergency button). */
  const start = useCallback(async (minutes: number, fallback: LatLng | null, known?: LatLng) => {
    setStarting(true);
    setError(null);
    try {
      const pos = known ? null : await currentPosition();
      const point = known ?? (pos ? { lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy } : fallback);
      if (!point) throw new Error("Allow location access so your contacts can follow you.");
      const res = await fetch("/api/live", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...point, minutes }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Couldn't start live sharing.");
      const s: Session = { id: data.id, secret: data.secret, expiresAt: data.expiresAt, point };
      latest.current = point;
      onMoveRef.current({ lat: point.lat, lng: point.lng });
      saveSession(s);
      setSession(s);
      return { url: `${window.location.origin}/track/${s.id}`, expiresAt: s.expiresAt };
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't start live sharing.");
      return null;
    } finally {
      setStarting(false);
    }
  }, []);

  const stop = useCallback(async () => {
    const s = session;
    end();
    if (!s) return;
    try {
      await fetch(`/api/live/${s.id}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ secret: s.secret }),
      });
    } catch {
      // the share still expires on its own
    }
  }, [session, end]);

  const url = session && typeof window !== "undefined" ? `${window.location.origin}/track/${session.id}` : null;
  return { session, url, starting, error, following, lastSentAt, start, stop };
}
