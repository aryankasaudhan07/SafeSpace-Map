"use client";

import { useEffect, useRef, useState } from "react";
import { IconBadge } from "./Icon";
import { ROUTE_LEVELS, type RouteResult, type ScoredRoute } from "@/lib/route-shared";
import { liveMessage, nativeShare } from "@/lib/share";
import { CATEGORIES, TIMES, type LatLng } from "@/lib/types";
import type { LiveShare } from "@/lib/useLiveShare";

export interface RouteEnd {
  point: LatLng;
  label: string;
}

interface Props {
  me: LatLng | null;
  onLocate: (p: LatLng) => void;
  from: RouteEnd | null;
  to: RouteEnd | null;
  onFrom: (e: RouteEnd | null) => void;
  onTo: (e: RouteEnd | null) => void;
  pickTarget: "from" | "to";
  onPickTarget: (t: "from" | "to") => void;
  stations: { name: string; lat: number; lng: number }[];
  result: RouteResult | null;
  onResult: (r: RouteResult | null) => void;
  selectedId: string | null;
  onSelect: (id: string) => void;
  includeDemo: boolean;
  live: LiveShare;
  onClose: () => void;
}

interface Suggestion {
  name: string;
  detail: string;
  lat: number;
  lng: number;
  metro?: boolean;
}

/** Google Maps walking directions that follow our chosen route, by passing a few points along it as waypoints. */
function googleRouteUrl(r: ScoredRoute) {
  const c = r.coords;
  const at = (f: number) => c[Math.min(c.length - 1, Math.round((c.length - 1) * f))];
  const fmt = ([lat, lng]: [number, number]) => `${lat.toFixed(6)},${lng.toFixed(6)}`;
  const waypoints = [0.25, 0.5, 0.75].map((f) => fmt(at(f))).join("|");
  return `https://www.google.com/maps/dir/?api=1&origin=${fmt(c[0])}&destination=${fmt(c[c.length - 1])}&travelmode=walking&waypoints=${encodeURIComponent(waypoints)}`;
}

export default function RoutePanel(props: Props) {
  const { me, onLocate, from, to, onFrom, onTo, pickTarget, onPickTarget, stations, result, onResult, selectedId, onSelect, includeDemo, live, onClose } = props;
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [searchNote, setSearchNote] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [locating, setLocating] = useState(false);
  const searchSeq = useRef(0);

  function startFromMyLocation() {
    if (me) return onFrom({ point: me, label: "My location" });
    if (!navigator.geolocation) return setError("Location isn't available. Tap the map to set your start.");
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const p = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        onLocate(p);
        onFrom({ point: p, label: "My location" });
        setLocating(false);
      },
      () => {
        setLocating(false);
        setError("Couldn't get your location. Tap the map to set where you're starting.");
        onPickTarget("from");
      },
      { enableHighAccuracy: true, timeout: 10000 },
    );
  }

  // A new start clears the "couldn't get your location" message.
  useEffect(() => {
    if (from) setError(null);
  }, [from]);

  // Start from the user's location when the panel opens.
  useEffect(() => {
    if (!from) startFromMyLocation();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Place suggestions for the field being edited: matching metro stations instantly, then OpenStreetMap places.
  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setSuggestions([]);
      setSearchNote(null);
      return;
    }
    const lower = q.toLowerCase();
    const metro: Suggestion[] = stations
      .filter((s) => s.name.toLowerCase().includes(lower))
      .slice(0, 4)
      .map((s) => ({ ...s, detail: "Metro station", metro: true }));
    setSuggestions(metro);
    if (q.length < 3) return;

    const seq = ++searchSeq.current;
    const t = setTimeout(async () => {
      try {
        const d = await fetch(`/api/geocode?q=${encodeURIComponent(q)}`).then((r) => r.json());
        if (seq !== searchSeq.current) return;
        setSuggestions([...metro, ...((d.places ?? []) as Suggestion[])].slice(0, 8));
        setSearchNote(d.error ?? null);
      } catch {
        if (seq === searchSeq.current) setSearchNote("Place search is unavailable. Tap the map to choose instead.");
      }
    }, 350);
    return () => clearTimeout(t);
  }, [query, stations]);

  // Find routes whenever both ends are set.
  useEffect(() => {
    if (!from || !to) {
      onResult(null);
      return;
    }
    const ctrl = new AbortController();
    setLoading(true);
    setError(null);
    onResult(null);
    fetch("/api/route", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ from: from.point, to: to.point, includeDemo }),
      signal: ctrl.signal,
    })
      .then(async (res) => {
        const d = await res.json();
        if (!res.ok) throw new Error(d.error || "Couldn't find a route.");
        onResult(d);
        onSelect(d.routes[0].id);
      })
      .catch((err) => {
        if (!ctrl.signal.aborted) setError(err instanceof Error ? err.message : "Couldn't find a route.");
      })
      .finally(() => {
        if (!ctrl.signal.aborted) setLoading(false);
      });
    return () => ctrl.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [from, to, includeDemo]);

  function choose(s: Suggestion) {
    const end = { point: { lat: s.lat, lng: s.lng }, label: s.name };
    if (pickTarget === "from") {
      onFrom(end);
      if (!to) onPickTarget("to");
    } else onTo(end);
    setQuery("");
    setSuggestions([]);
  }

  async function shareLiveOnRoute() {
    const started = live.session && live.url ? { url: live.url, expiresAt: live.session.expiresAt } : await live.start(60, from?.point ?? me);
    if (started) await nativeShare(liveMessage(started.url, started.expiresAt));
  }

  const selected = result?.routes.find((r) => r.id === selectedId) ?? null;

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">Safest route</h2>
          <p className="text-sm text-slate-500">Walking routes compared by what women have reported along each one.</p>
        </div>
        <button onClick={onClose} className="text-sm text-slate-500 hover:underline">
          Close
        </button>
      </div>

      {/* From / To: each can be searched, set from GPS ("My location") or tapped on the map */}
      <div className="space-y-2 rounded-[22px] bg-soft p-3">
        {(["from", "to"] as const).map((field) => {
          const end = field === "from" ? from : to;
          const set = field === "from" ? onFrom : onTo;
          const active = pickTarget === field;
          return (
            <div key={field} className="relative">
              <EndRow
                dot={field === "from" ? "#111" : "#e11d48"}
                label={field === "from" ? "From" : "To"}
                value={end?.label ?? (field === "from" && locating ? "Finding your location…" : null)}
                picking={active}
                action={
                  end
                    ? {
                        text: "Change",
                        onClick: () => {
                          set(null);
                          onPickTarget(field);
                        },
                      }
                    : field === "from"
                      ? { text: "My location", onClick: startFromMyLocation }
                      : undefined
                }
              >
                {!end && !(field === "from" && locating) && (
                  <input
                    value={active ? query : ""}
                    onChange={(e) => setQuery(e.target.value)}
                    onFocus={() => {
                      if (!active) setQuery("");
                      onPickTarget(field);
                    }}
                    placeholder={field === "from" ? "Search your start" : "Search a place or metro station"}
                    aria-label={field === "from" ? "Start" : "Destination"}
                    className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-slate-400"
                  />
                )}
              </EndRow>
              {active && !end && suggestions.length > 0 && (
                <ul className="absolute inset-x-0 top-full z-20 mt-1 max-h-72 overflow-y-auto rounded-2xl bg-white p-1.5 shadow-xl ring-1 ring-slate-100">
                  {suggestions.map((s) => (
                    <li key={`${s.name}-${s.lat}`}>
                      <button onClick={() => choose(s)} className="flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left hover:bg-soft">
                        <IconBadge name={s.metro ? "metro" : "pin"} color={s.metro ? "#7c3aed" : "#64748b"} size={26} />
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-medium">{s.name}</span>
                          {s.detail && <span className="block truncate text-xs text-slate-500">{s.detail}</span>}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          );
        })}
        {from && to && (
          <button
            onClick={() => {
              onFrom(to);
              onTo(from);
            }}
            className="w-full rounded-full bg-white py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100"
          >
            ⇅ Swap start and destination
          </button>
        )}
      </div>
      {searchNote && <p className="text-xs text-slate-500">{searchNote}</p>}
      {!(from && to) && (
        <p className="text-xs text-slate-500">
          Or tap the map to set the {pickTarget === "from" ? "start" : "destination"}.
        </p>
      )}

      {loading && <p className="text-sm text-slate-500">Comparing walking routes against community reports…</p>}
      {error && <p className="rounded-2xl bg-red-50 p-3 text-sm text-red-800">{error}</p>}

      {/* Route options */}
      {result && (
        <div className="space-y-2">
          <p className="text-xs text-slate-500">
            {result.routes.length} route{result.routes.length === 1 ? "" : "s"} · reports from the {TIMES[result.timeOfDay].split(" (")[0].toLowerCase()} count
            extra right now
          </p>
          {result.routes.map((r) => (
            <RouteCard key={r.id} route={r} selected={r.id === selectedId} onSelect={() => onSelect(r.id)} />
          ))}
        </div>
      )}

      {selected && (
        <div className="space-y-3">
          {selected.spots.length > 0 && (
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Reported along this route</p>
              <ul className="space-y-1.5">
                {selected.spots.map((s) => (
                  <li key={s.id} className="flex items-center gap-2.5 rounded-2xl bg-soft p-3">
                    <IconBadge name="warning" color={CATEGORIES[s.category].color} size={28} />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{s.title}</p>
                      <p className="text-xs text-slate-500">
                        {CATEGORIES[s.category].short} · severity {s.severity}/5 · {s.distanceM} m from route{s.verified ? " · confirmed" : ""}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <a
            href={googleRouteUrl(selected)}
            target="_blank"
            rel="noreferrer"
            className="flex w-full items-center justify-center rounded-full bg-[#111] py-3 text-sm font-medium text-white hover:bg-black"
          >
            Navigate this route in Google Maps
          </a>
          <button
            onClick={shareLiveOnRoute}
            disabled={live.starting}
            className="w-full rounded-full border border-emerald-600 bg-white py-3 text-sm font-medium text-emerald-700 hover:bg-emerald-50 disabled:opacity-70"
          >
            {live.session ? "Send my live location link again" : live.starting ? "Starting live sharing…" : "Share live location while I walk"}
          </button>
          {live.error && <p className="text-xs text-red-700">{live.error}</p>}
        </div>
      )}

      <p className="text-[11px] leading-relaxed text-slate-400">
        Scores use community reports{includeDemo ? " (including demo data)" : ""} and staffed places from OpenStreetMap. No route is guaranteed
        safe: prefer busy, well-lit roads and trust your instincts. Routing © OpenStreetMap contributors, OSRM.
      </p>
    </div>
  );
}

function EndRow({
  dot,
  label,
  value,
  picking,
  action,
  children,
}: {
  dot: string;
  label: string;
  value: string | null;
  picking: boolean;
  action?: { text: string; onClick: () => void };
  children?: React.ReactNode;
}) {
  return (
    <div className={`flex items-center gap-2.5 rounded-2xl bg-white px-3 py-2.5 ${picking ? "ring-2 ring-brand/40" : ""}`}>
      <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: dot }} aria-hidden />
      <span className="w-9 shrink-0 text-xs text-slate-500">{label}</span>
      {children || <span className={`min-w-0 flex-1 truncate text-sm ${value ? "font-medium" : "text-slate-400"}`}>{value}</span>}
      {action && (
        <button onClick={action.onClick} className="shrink-0 text-xs font-medium text-blue-700 hover:underline">
          {action.text}
        </button>
      )}
    </div>
  );
}

function RouteCard({ route, selected, onSelect }: { route: ScoredRoute; selected: boolean; onSelect: () => void }) {
  const level = ROUTE_LEVELS[route.level];
  const help = [
    route.help.police && { icon: "police" as const, color: "#1d4ed8", n: route.help.police, label: "police" },
    route.help.metro && { icon: "metro" as const, color: "#7c3aed", n: route.help.metro, label: "metro" },
    route.help.hospital && { icon: "hospital" as const, color: "#dc2626", n: route.help.hospital, label: "hospital" },
  ].filter(Boolean) as { icon: "police" | "metro" | "hospital"; color: string; n: number; label: string }[];

  return (
    <button
      onClick={onSelect}
      aria-pressed={selected}
      className={`w-full rounded-[22px] p-4 text-left transition ${selected ? "bg-white shadow-[0_12px_32px_-12px_rgba(91,43,224,0.45)] ring-2 ring-brand" : "bg-soft hover:bg-slate-100"}`}
    >
      <div className="flex flex-wrap items-center gap-1.5">
        {route.tags.includes("safest") && <span className="rounded-full bg-emerald-600 px-2.5 py-0.5 text-[11px] font-semibold text-white">✓ Safest</span>}
        {route.tags.includes("fastest") && <span className="rounded-full bg-[#111] px-2.5 py-0.5 text-[11px] font-semibold text-white">Fastest</span>}
        <span className="rounded-full px-2.5 py-0.5 text-[11px] font-medium" style={{ background: level.bg, color: level.color }}>
          {level.label}
        </span>
        <span className="ml-auto text-sm font-semibold">
          {route.walkMin} min <span className="font-normal text-slate-500">· {route.distanceKm} km</span>
        </span>
      </div>
      <p className="mt-2 text-sm leading-snug text-slate-700">{route.reason}</p>
      {help.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-2">
          {help.map((h) => (
            <span key={h.label} className="flex items-center gap-1 text-xs text-slate-600">
              <IconBadge name={h.icon} color={h.color} size={20} /> {h.n}
            </span>
          ))}
        </div>
      )}
    </button>
  );
}
