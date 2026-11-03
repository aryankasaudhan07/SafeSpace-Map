"use client";

import dynamic from "next/dynamic";
import { useParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { IconBadge } from "@/components/Icon";
import Logo from "@/components/Logo";
import ThemeToggle from "@/components/ThemeToggle";
import { distanceKm } from "@/lib/geo";
import { LIVE_SEND_MS, LIVE_STALE_MS, type LiveView } from "@/lib/live-shared";
import { directionsUrl, type NearbyPlace } from "@/lib/safety";
import { googleMapsLink } from "@/lib/share";

const TrackMap = dynamic(() => import("@/components/TrackMap"), {
  ssr: false,
  loading: () => <div className="flex h-full items-center justify-center text-sm text-slate-400">Loading map…</div>,
});

function ago(ms: number) {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 60) return `${s} s ago`;
  const m = Math.round(s / 60);
  return m < 60 ? `${m} min ago` : `${Math.round(m / 60)} h ago`;
}

const clock = (iso: string) => new Date(iso).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" });

/** What a trusted contact sees when they open a live-location link. */
export default function TrackPage() {
  const { id } = useParams<{ id: string }>();
  const [view, setView] = useState<LiveView | null>(null);
  const [missing, setMissing] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [follow, setFollow] = useState(true);
  const [police, setPolice] = useState<NearbyPlace[]>([]);
  const policeAt = useRef<{ lat: number; lng: number } | null>(null);

  const ended = view && view.status !== "live";

  // Poll for the latest position until the share ends.
  useEffect(() => {
    if (ended || missing) return;
    let alive = true;
    async function poll() {
      try {
        const res = await fetch(`/api/live/${id}`, { cache: "no-store" });
        if (res.status === 404) return alive && setMissing(true);
        if (res.ok && alive) setView(await res.json());
      } catch {
        // viewer offline for a moment: retry on the next tick
      }
    }
    poll();
    const t = setInterval(poll, LIVE_SEND_MS);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [id, ended, missing]);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  // Nearest police to the sharer, refreshed when they have moved a few hundred metres.
  const last = view?.last ?? null;
  useEffect(() => {
    if (!last || (policeAt.current && distanceKm(policeAt.current, last) < 0.3)) return;
    policeAt.current = { lat: last.lat, lng: last.lng };
    fetch(`/api/safe-places?lat=${last.lat}&lng=${last.lng}`)
      .then((r) => r.json())
      .then((d: { places?: NearbyPlace[] }) => setPolice((d.places ?? []).filter((p) => p.kind === "police").slice(0, 2)))
      .catch(() => {});
  }, [last]);

  const age = last ? now - new Date(last.at).getTime() : 0;
  const stale = !!last && age > LIVE_STALE_MS;

  return (
    <div className="flex min-h-dvh flex-col bg-canvas text-slate-900 lg:h-dvh lg:p-5">
      <div className="mx-auto flex min-h-0 w-full max-w-[1520px] flex-1 flex-col bg-white lg:flex-row-reverse lg:overflow-hidden lg:rounded-[36px] lg:shadow-[0_40px_90px_-40px_rgba(15,23,42,0.35)]">
        {/* Map */}
        <div className="relative h-[58dvh] shrink-0 lg:m-4 lg:ml-0 lg:h-auto lg:min-h-0 lg:flex-1 lg:overflow-hidden lg:rounded-[28px]">
          <TrackMap last={last} trail={view?.trail ?? []} police={police} follow={follow} stale={stale} />
          {last && (
            <button
              onClick={() => setFollow((f) => !f)}
              aria-pressed={follow}
              className={`absolute left-3 top-3 z-[500] rounded-full px-4 py-2 text-xs font-medium shadow-md ${follow ? "bg-[#111] text-white" : "bg-white text-slate-700"}`}
            >
              {follow ? "Following" : "Follow on map"}
            </button>
          )}
          {!last && (
            <div className="absolute inset-0 z-[500] grid place-items-center bg-white/70 p-6 text-center text-sm text-slate-600">
              {missing ? "This live-location link isn't valid." : ended ? "Location sharing has ended." : "Connecting…"}
            </div>
          )}
        </div>

        {/* Status panel */}
        <aside className="shrink-0 space-y-4 p-5 lg:w-[420px] lg:overflow-y-auto lg:p-9">
          <div className="flex items-center justify-between gap-2.5">
            <div className="flex items-center gap-2.5">
              <Logo />
              <span className="text-[17px] tracking-tight">
                SafeSpace <span className="font-bold">Map</span>
              </span>
            </div>
            <ThemeToggle />
          </div>

          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Live location</h1>
            <p className="text-sm text-slate-500">Someone shared their live location with you so you can check they get there safely.</p>
          </div>

          {missing ? (
            <StatusCard tone="grey" title="Link not found" text="Ask them to send the link again." />
          ) : !view ? (
            <StatusCard tone="grey" title="Connecting…" text="Getting the latest position." />
          ) : view.status === "stopped" ? (
            <StatusCard tone="grey" title="Sharing stopped" text="They turned off live location. Their position is no longer shown." />
          ) : view.status === "expired" ? (
            <StatusCard tone="grey" title="Sharing ended" text={`Live location ended at ${clock(view.expiresAt)}.`} />
          ) : stale ? (
            <StatusCard
              tone="amber"
              title={`Last seen ${ago(age)}`}
              text="Their phone may be offline, locked or out of battery. If you can't reach them and are worried, call 112."
            />
          ) : (
            <StatusCard tone="green" title="Live now" text={`Updated ${ago(age)} · sharing until ${clock(view.expiresAt)}`} live />
          )}

          {last && (
            <>
              <div className="grid grid-cols-2 gap-2">
                <a href={`tel:112`} className="rounded-full bg-red-600 py-3 text-center text-sm font-semibold text-white hover:bg-red-700">
                  Call 112
                </a>
                <a
                  href={directionsUrl(last)}
                  target="_blank"
                  rel="noreferrer"
                  className="rounded-full bg-[#111] py-3 text-center text-sm font-medium text-white hover:bg-black"
                >
                  Directions
                </a>
              </div>
              <a href={googleMapsLink(last)} target="_blank" rel="noreferrer" className="block text-center text-xs font-medium text-blue-700 hover:underline">
                Open in Google Maps · {last.lat.toFixed(5)}, {last.lng.toFixed(5)}
                {last.accuracy ? ` (±${last.accuracy} m)` : ""}
              </a>

              {police.length > 0 && (
                <div>
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Police near them</p>
                  <ul className="space-y-1.5">
                    {police.map((p) => {
                      const km = Math.round(distanceKm(last, p) * 100) / 100;
                      return (
                        <li key={p.id} className="flex items-center justify-between gap-2 rounded-2xl bg-soft p-3">
                          <div className="flex min-w-0 items-center gap-2.5">
                            <IconBadge name="police" color="#1d4ed8" size={30} />
                            <div className="min-w-0">
                              <p className="truncate text-sm font-medium">{p.name}</p>
                              <p className="text-xs text-slate-500">{km} km from them</p>
                            </div>
                          </div>
                          {p.phone && (
                            <a href={`tel:${p.phone}`} className="shrink-0 rounded-full bg-white px-3 py-1 text-xs font-medium">
                              Call
                            </a>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}
            </>
          )}

          <p className="text-[11px] text-slate-400">
            Only people with this link can see it. The position disappears as soon as sharing stops. Map data © OpenStreetMap contributors.
          </p>
        </aside>
      </div>
    </div>
  );
}

const TONES = {
  green: "bg-emerald-50 text-emerald-900",
  amber: "bg-amber-50 text-amber-900",
  grey: "bg-soft text-slate-700",
};

function StatusCard({ tone, title, text, live }: { tone: keyof typeof TONES; title: string; text: string; live?: boolean }) {
  return (
    <div className={`rounded-[22px] p-4 ${TONES[tone]}`} role="status">
      <p className="flex items-center gap-2 font-semibold">
        {live && (
          <span className="relative flex h-2.5 w-2.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500 opacity-60 motion-reduce:animate-none" />
            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500" />
          </span>
        )}
        {title}
      </p>
      <p className="mt-0.5 text-xs opacity-80">{text}</p>
    </div>
  );
}
