"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import AreaPanel from "@/components/AreaPanel";
import { EmergencyScreen, SosButton, useEmergency } from "@/components/EmergencyPanel";
import HelpPanel from "@/components/HelpPanel";
import { Icon, IconBadge } from "@/components/Icon";
import Logo from "@/components/Logo";
import ThemeToggle from "@/components/ThemeToggle";
import { distanceKm } from "@/lib/geo";
import { buzz } from "@/lib/haptics";
import type { IconName } from "@/lib/icons";
import ReportForm from "@/components/ReportForm";
import RoutePanel, { type RouteEnd } from "@/components/RoutePanel";
import type { RouteResult } from "@/lib/route-shared";
import type { NearbyPlace } from "@/lib/safety";
import { trustStatus } from "@/lib/trust";
import { useLiveShare } from "@/lib/useLiveShare";
import { CATEGORIES, CATEGORY_KEYS, TIMES, TIME_KEYS, type Category, type LatLng, type Report, type TimeOfDay } from "@/lib/types";

const OFFLINE_PLACES_KEY = "safespace-offline-places";

const SafetyMap = dynamic(() => import("@/components/SafetyMap"), {
  ssr: false,
  loading: () => <div className="flex h-full items-center justify-center text-sm text-slate-400">Loading map…</div>,
});

export default function Home() {
  const [reports, setReports] = useState<Report[]>([]);
  const [meta, setMeta] = useState<{ ai: string; storage: string; places: number } | null>(null);
  const [loadError, setLoadError] = useState(false);

  const [cats, setCats] = useState<Set<Category>>(() => new Set(CATEGORY_KEYS));
  const [time, setTime] = useState<TimeOfDay | "all">("all");
  // Real reports only by default; demo data is opt-in (toggle, or ?demo=1 for presentations).
  const [showDemo, setShowDemo] = useState(false);
  const [view, setView] = useState<"heat" | "pins">("heat");

  const [mode, setMode] = useState<"explore" | "report" | "help" | "route">("explore");
  const [menuOpen, setMenuOpen] = useState(false);
  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setMenuOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [menuOpen]);
  const [routeFrom, setRouteFrom] = useState<RouteEnd | null>(null);
  const [routeTo, setRouteTo] = useState<RouteEnd | null>(null);
  const [routePick, setRoutePick] = useState<"from" | "to">("to");
  const [routeResult, setRouteResult] = useState<RouteResult | null>(null);
  const [routeSel, setRouteSel] = useState<string | null>(null);
  const [picked, setPicked] = useState<LatLng | null>(null);
  const [focus, setFocus] = useState<LatLng | null>(null);
  const [focusLabel, setFocusLabel] = useState<{ text: string; icon: IconName; color: string } | null>(null);
  const [stations, setStations] = useState<{ name: string; lat: number; lng: number }[]>([]);
  const [stationQuery, setStationQuery] = useState("");
  const [flyTo, setFlyTo] = useState<LatLng | null>(null);
  const asideRef = useRef<HTMLElement>(null);

  const [me, setMe] = useState<LatLng | null>(null);
  // Live sharing follows GPS; only move "me" (and refetch safe places) after ~50 m.
  const live = useLiveShare(useCallback((p: LatLng) => setMe((prev) => (prev && distanceKm(prev, p) < 0.05 ? prev : p)), []));
  const emergency = useEmergency({ me, live });
  const [places, setPlaces] = useState<NearbyPlace[]>([]);
  const [placesLoading, setPlacesLoading] = useState(false);
  const [selectedPlaceId, setSelectedPlaceId] = useState<string | null>(null);
  const [areaPolice, setAreaPolice] = useState<NearbyPlace[]>([]);
  const [locating, setLocating] = useState(false);
  const [locateMsg, setLocateMsg] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 3500);
  }

  async function vote(id: string, kind: "confirm" | "dispute") {
    try {
      const res = await fetch("/api/reports/vote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, vote: kind }),
      });
      const data = await res.json();
      if (!res.ok) return showToast(data.error || "Couldn't record your vote.");
      buzz("tap");
      setReports((prev) =>
        data.hidden
          ? prev.filter((r) => r.id !== id)
          : prev.map((r) => (r.id === id ? { ...r, confirms: data.confirms, disputes: data.disputes } : r)),
      );
      showToast(
        data.hidden
          ? "Thanks. Several people disputed this report, so it's been removed from the map."
          : kind === "confirm"
            ? "Thanks for confirming. Verified reports help others stay safe."
            : "Thanks. Reports that several people dispute are removed automatically.",
      );
    } catch {
      showToast("Couldn't record your vote.");
    }
  }

  /** "My location" button: works in every mode. */
  function goToMyLocation() {
    if (!navigator.geolocation) {
      setLocateMsg("Location isn't available in this browser. Tap the map instead.");
      return;
    }
    setLocating(true);
    setLocateMsg(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const p = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setLocating(false);
        setMe(p);
        setFlyTo(p);
        if (mode === "report") setPicked(p);
        else if (mode === "route") setRouteFrom({ point: p, label: "My location" });
        else if (mode === "explore") {
          setFocus(p);
          setFocusLabel({ text: "Your location", icon: "pin", color: "#2563eb" });
          asideRef.current?.scrollTo({ top: 0, behavior: "smooth" });
        }
      },
      () => {
        setLocating(false);
        setLocateMsg("Couldn't get your location. Allow location access, or tap the map.");
        setTimeout(() => setLocateMsg(null), 5000);
      },
      { enableHighAccuracy: true, timeout: 10000 },
    );
  }

  useEffect(() => {
    if (mode !== "help" || !me) return;
    const ctrl = new AbortController();
    setPlacesLoading(true);
    fetch(`/api/safe-places?lat=${me.lat}&lng=${me.lng}`, { signal: ctrl.signal })
      .then((r) => r.json())
      .then((d) => {
        setPlaces(d.places ?? []);
        setPlacesLoading(false);
        // Kept on the phone for the offline page (no signal in the Metro, dead zones).
        try {
          localStorage.setItem(OFFLINE_PLACES_KEY, JSON.stringify({ at: Date.now(), places: d.places ?? [] }));
        } catch {
          // storage blocked
        }
      })
      .catch((e) => {
        if (e.name === "AbortError") return;
        setPlacesLoading(false);
        // Offline: fall back to the safe places saved last time.
        try {
          const saved = JSON.parse(localStorage.getItem(OFFLINE_PLACES_KEY) ?? "null");
          if (saved?.places) setPlaces(saved.places);
        } catch {
          // nothing saved
        }
      });
    return () => ctrl.abort();
  }, [mode, me]);

  // Android/desktop Chrome offer "install as app"; keep the event so our own button can trigger it.
  const [installPrompt, setInstallPrompt] = useState<(Event & { prompt: () => Promise<void> }) | null>(null);
  useEffect(() => {
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setInstallPrompt(e as Event & { prompt: () => Promise<void> });
    };
    const onInstalled = () => setInstallPrompt(null);
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  // Links from the invite poster / WhatsApp message: ?go=report opens the report form, ?demo=1 shows sample data.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("demo") === "1") setShowDemo(true);
    if (params.get("go") === "report") setMode("report");
    if (params.get("go") === "help") setMode("help");
  }, []);

  useEffect(() => {
    fetch("/api/metro-stations")
      .then((r) => r.json())
      .then((d) => setStations(d.stations ?? []))
      .catch(() => {});
  }, []);

  function pickStation(name: string) {
    setStationQuery(name);
    const st = stations.find((s) => s.name === name);
    if (!st) return;
    setFocus({ lat: st.lat, lng: st.lng });
    setFocusLabel({ text: st.name, icon: "metro", color: "#7c3aed" });
    setFlyTo({ lat: st.lat, lng: st.lng });
  }

  useEffect(() => {
    fetch("/api/reports")
      .then((r) => r.json())
      .then((d) => {
        if (d.error) throw new Error(d.error);
        setReports(d.reports);
        setMeta({ ai: d.ai, storage: d.storage, places: d.places });
      })
      .catch(() => setLoadError(true));
  }, []);

  const filtered = useMemo(
    () =>
      reports.filter(
        (r) => cats.has(r.category) && (time === "all" || r.timeOfDay === time) && (showDemo || !r.demo),
      ),
    [reports, cats, time, showDemo],
  );

  const realCount = useMemo(() => reports.filter((r) => !r.demo).length, [reports]);

  const stats = useMemo(() => {
    const counts: Partial<Record<Category, number>> = {};
    for (const r of filtered) counts[r.category] = (counts[r.category] ?? 0) + 1;
    const top = (Object.entries(counts) as [Category, number][]).sort((a, b) => b[1] - a[1])[0];
    return {
      total: filtered.length,
      severe: filtered.filter((r) => r.severity >= 4).length,
      top: top ? CATEGORIES[top[0]].short : "—",
    };
  }, [filtered]);

  const recent = useMemo(
    () => [...filtered].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 8),
    [filtered],
  );

  const onMapClick = useCallback(
    (p: LatLng) => {
      if (mode === "report") setPicked(p);
      else if (mode === "help") setMe(p);
      else if (mode === "route") {
        // Once both ends are set, taps are for panning and picking routes; use "Change" to move an end.
        if (routeFrom && routeTo) return;
        if (routePick === "from") {
          setRouteFrom({ point: p, label: "Pinned on map" });
          setRoutePick("to");
        } else setRouteTo({ point: p, label: "Pinned on map" });
      } else {
        setFocus(p);
        setFocusLabel(null);
      }
    },
    [mode, routePick, routeFrom, routeTo],
  );

  function toggleCat(c: Category) {
    setCats((prev) => {
      const next = new Set(prev);
      if (next.has(c)) next.delete(c);
      else next.add(c);
      return next;
    });
  }

  function startHelp() {
    buzz("sos");
    setMode("help");
    setFocus(null);
    setPicked(null);
    if (me) setFlyTo(me);
  }

  function locateMe(p: LatLng) {
    setMe(p);
    setFlyTo(p);
  }

  function startRoute() {
    setMode("route");
    setFocus(null);
    setPicked(null);
    setRoutePick(routeFrom ? "to" : "from");
  }

  function startReport() {
    setMode("report");
    setFocus(null);
    setPicked(null);
  }

  const nav: { key: typeof mode; label: string; hint: string; icon: IconName; color: string; onClick: () => void }[] = [
    { key: "explore", label: "Explore", hint: "Heatmap, area checks, metro stations", icon: "sparkle", color: "#5b2be0", onClick: () => setMode("explore") },
    { key: "route", label: "Safe route", hint: "Compare walking routes by reports", icon: "pin", color: "#059669", onClick: startRoute },
    { key: "report", label: "Report", hint: "Pin a place where you felt unsafe", icon: "warning", color: "#e11d48", onClick: startReport },
    { key: "help", label: "Help now", hint: "Helplines, live location, fake call", icon: "sos", color: "#ef4444", onClick: startHelp },
  ];

  const modeHint =
    mode === "report"
      ? "Tap the map where it happened"
      : mode === "help"
        ? "Tap the map to set where you are"
        : mode === "route"
          ? routeFrom && routeTo
            ? routeResult && routeResult.routes.length > 1
              ? "Tap a grey route to compare it"
              : "Use Change to move the start or destination"
            : `Tap the map to set your ${routePick === "from" ? "start" : "destination"}`
          : "Tap anywhere for an AI safety check";

  return (
    <div className="min-h-dvh bg-canvas text-slate-900 lg:h-dvh lg:p-5">
      <EmergencyScreen emergency={emergency} />
      <div className="mx-auto flex min-h-dvh max-w-[1520px] flex-col bg-white lg:h-full lg:min-h-0 lg:overflow-hidden lg:rounded-[36px] lg:shadow-[0_40px_90px_-40px_rgba(15,23,42,0.35)]">
        {/* Header */}
        <header className="relative flex items-center justify-between gap-4 px-5 py-4 lg:px-9 lg:py-5">
          <button onClick={() => setMode("explore")} className="flex items-center gap-2.5" aria-label="SafeSpace Map home">
            <Logo />
            <span className="whitespace-nowrap text-base tracking-tight sm:text-[17px]">
              SafeSpace <span className="font-bold">Map</span>
            </span>
          </button>

          <nav className="hidden items-center gap-7 text-[15px] md:flex xl:gap-8" aria-label="Main">
            {nav.map((item) => (
              <button
                key={item.key}
                onClick={item.onClick}
                aria-current={mode === item.key ? "page" : undefined}
                className={`relative py-1 transition-colors ${mode === item.key ? "font-semibold text-slate-900" : "text-slate-500 hover:text-slate-900"}`}
              >
                {item.label}
                {mode === item.key && <span className="absolute -bottom-1.5 left-1/2 h-1.5 w-1.5 -translate-x-1/2 rounded-full bg-accent" />}
              </button>
            ))}
            {/* Separate pages; on narrower screens they live in the ☰ menu */}
            <Link href="/invite" className="hidden py-1 text-slate-500 transition-colors hover:text-slate-900 lg:inline">
              Invite
            </Link>
            <Link href="/control" className="hidden py-1 font-medium text-accent transition-colors hover:text-[#d97f16] lg:inline">
              Control room
            </Link>
          </nav>

          <div className="flex items-center gap-2">
            <ThemeToggle className="hidden sm:grid" />
            <SosButton emergency={emergency} onTap={startHelp} />
            {/* Phones and tablets: every section (plus Invite and Control room) behind a ☰ menu */}
            <button
              onClick={() => setMenuOpen((o) => !o)}
              aria-expanded={menuOpen}
              aria-controls="mobile-menu"
              aria-label={menuOpen ? "Close menu" : "Open menu"}
              className="grid h-11 w-11 place-items-center rounded-full border border-slate-200 bg-white lg:hidden"
            >
              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden>
                {menuOpen ? <path d="M6 6l12 12M18 6 6 18" /> : <path d="M4 7h16M4 12h16M4 17h16" />}
              </svg>
            </button>
          </div>

          {menuOpen && (
            <>
              <div className="fixed inset-0 z-[1500] lg:hidden" onClick={() => setMenuOpen(false)} aria-hidden />
              <nav
                id="mobile-menu"
                aria-label="Main"
                className="absolute inset-x-4 top-full z-[1600] -mt-1 rounded-[24px] bg-white p-2 shadow-[0_24px_60px_-20px_rgba(15,23,42,0.45)] ring-1 ring-slate-100 md:left-auto md:right-4 md:w-[360px] lg:hidden"
              >
                {nav.map((item) => (
                  <button
                    key={item.key}
                    onClick={() => {
                      setMenuOpen(false);
                      item.onClick();
                    }}
                    aria-current={mode === item.key ? "page" : undefined}
                    className={`flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-left ${mode === item.key ? "bg-soft font-semibold" : "hover:bg-soft"}`}
                  >
                    <IconBadge name={item.icon} color={item.color} size={34} />
                    <span className="min-w-0">
                      <span className="block text-[15px]">{item.label}</span>
                      <span className="block text-xs font-normal text-slate-500">{item.hint}</span>
                    </span>
                  </button>
                ))}
                <Link
                  href="/invite"
                  onClick={() => setMenuOpen(false)}
                  className="flex w-full items-center gap-3 rounded-2xl px-3 py-3 hover:bg-soft"
                >
                  <IconBadge name="reports" color="#64748b" size={34} />
                  <span>
                    <span className="block text-[15px]">Invite friends</span>
                    <span className="block text-xs text-slate-500">WhatsApp message and QR poster</span>
                  </span>
                </Link>
                <Link
                  href="/control"
                  onClick={() => setMenuOpen(false)}
                  className="flex w-full items-center gap-3 rounded-2xl px-3 py-3 hover:bg-soft"
                >
                  <IconBadge name="police" color="#1d4ed8" size={34} />
                  <span>
                    <span className="block text-[15px]">Control room (staff)</span>
                    <span className="block text-xs text-slate-500">Police and ambulance desks, passcode needed</span>
                  </span>
                </Link>
                <div className="mt-1 flex items-center justify-between gap-3 border-t border-slate-100 px-3 pb-1 pt-3">
                  <span>
                    <span className="block text-[15px]">Theme</span>
                    <span className="block text-xs text-slate-500">Light or dark</span>
                  </span>
                  <ThemeToggle />
                </div>
              </nav>
            </>
          )}
        </header>

        {live.session && (
          <div className="mx-5 mb-3 flex items-center justify-between gap-3 rounded-full bg-emerald-50 py-2 pl-4 pr-2 text-xs text-emerald-950 lg:mx-9" role="status">
            <p className="flex min-w-0 items-center gap-2 font-medium">
              <span className="relative flex h-2 w-2 shrink-0">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500 opacity-60 motion-reduce:animate-none" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
              </span>
              <span className="truncate">
                Sharing live location until{" "}
                {new Date(live.session.expiresAt).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" })}
              </span>
            </p>
            <div className="flex shrink-0 gap-1.5">
              {mode !== "help" && (
                <button onClick={startHelp} className="rounded-full bg-white px-3 py-1.5 font-medium text-emerald-800">
                  Manage
                </button>
              )}
              <button onClick={live.stop} className="rounded-full bg-red-600 px-3 py-1.5 font-semibold text-white">
                Stop
              </button>
            </div>
          </div>
        )}

        <main className="flex min-h-0 flex-1 flex-col lg:flex-row">
          {/* Side panel */}
          <aside ref={asideRef} className={`${mode === "help" ? "order-1" : "order-2"} min-h-0 px-5 pb-8 lg:order-1 lg:w-[470px] lg:shrink-0 lg:overflow-y-auto lg:px-9`}>
            {mode === "help" ? (
              <div className="pt-2">
                <HelpPanel
                  me={me}
                  onLocate={locateMe}
                  places={places}
                  placesLoading={placesLoading}
                  onShowPlace={(p) => {
                    setSelectedPlaceId(p.id);
                    setFlyTo({ lat: p.lat, lng: p.lng });
                  }}
                  onClose={() => setMode("explore")}
                  live={live}
                  emergency={emergency}
                />
              </div>
            ) : mode === "route" ? (
              <div className="pt-2">
                <RoutePanel
                  me={me}
                  onLocate={setMe}
                  from={routeFrom}
                  to={routeTo}
                  onFrom={setRouteFrom}
                  onTo={(e) => {
                    setRouteTo(e);
                    if (e) setFlyTo(e.point);
                  }}
                  pickTarget={routePick}
                  onPickTarget={setRoutePick}
                  stations={stations}
                  result={routeResult}
                  onResult={setRouteResult}
                  selectedId={routeSel}
                  onSelect={setRouteSel}
                  includeDemo={showDemo}
                  live={live}
                  onClose={() => setMode("explore")}
                />
              </div>
            ) : mode === "report" ? (
              <div className="pt-2">
                <ReportForm
                  picked={picked}
                  onPick={(p) => {
                    setPicked(p);
                    setFlyTo(p);
                  }}
                  onSubmitted={(r) => {
                    buzz("success");
                    setReports((prev) => [r, ...prev]);
                  }}
                  onClose={() => {
                    setMode("explore");
                    setPicked(null);
                  }}
                />
              </div>
            ) : (
              <div className="space-y-7">
                {loadError && <p className="rounded-2xl bg-red-50 p-3 text-sm text-red-700">Couldn&apos;t load reports. Refresh to try again.</p>}

                {focus ? (
                  <div className="pt-2">
                    <AreaPanel
                      focus={focus}
                      label={focusLabel}
                      includeDemo={showDemo}
                      onClear={() => {
                        setFocus(null);
                        setAreaPolice([]);
                      }}
                      onPolice={setAreaPolice}
                      onShowPoint={(p) => {
                        setFlyTo({ lat: p.lat, lng: p.lng });
                        setSelectedPlaceId("id" in p ? String(p.id) : null);
                      }}
                    />
                  </div>
                ) : (
                  <section className="pt-4 lg:pt-10">
                    <h1 className="text-[34px] font-medium leading-[1.15] tracking-tight text-slate-900 lg:text-[42px]">
                      Find The Safest Way
                      <br />
                      Through <RotatingWord words={["Delhi", "the Metro", "the Night", "Your Day"]} />
                    </h1>
                    <p className="mt-5 max-w-[380px] text-[15px] leading-relaxed text-slate-500">
                      Anonymous reports from women, checked by AI and confirmed by the community. See unsafe spots, the nearest
                      police station and what to do — before you go.
                    </p>
                    <p className="mt-8 text-sm text-slate-700">
                      Free, anonymous, <span className="font-semibold text-slate-900">no login</span>
                      {installPrompt && (
                        <>
                          {" · "}
                          <button
                            onClick={() => installPrompt.prompt().finally(() => setInstallPrompt(null))}
                            className="font-semibold text-brand hover:underline"
                          >
                            Install app
                          </button>
                        </>
                      )}
                    </p>
                    <div className="mt-3 flex flex-wrap gap-2.5">
                      <button
                        onClick={goToMyLocation}
                        disabled={locating}
                        className="flex items-center gap-2 rounded-full bg-[#111] px-4 py-3 text-sm font-medium text-white shadow-[0_14px_30px_-12px_rgba(0,0,0,0.6)] transition hover:bg-black disabled:opacity-70"
                      >
                        <CrosshairIcon spinning={locating} />
                        {locating ? "Locating…" : "Check my location"}
                      </button>
                      <button
                        onClick={startRoute}
                        className="rounded-full bg-brand px-4 py-3 text-sm font-medium text-white shadow-[0_14px_30px_-12px_rgba(91,43,224,0.7)] transition hover:opacity-90"
                      >
                        Safest route
                      </button>
                    </div>
                  </section>
                )}

                {/* Real-data call to action */}
                <div className="flex items-center gap-3 rounded-[22px] bg-[#f3f0fe] p-4">
                  <IconBadge name="reports" color="#5b2be0" size={36} />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-violet-950">
                      {realCount === 0
                        ? "Be the first to warn others"
                        : `${realCount.toLocaleString("en-IN")} real report${realCount === 1 ? "" : "s"} from women so far`}
                    </p>
                    <p className="text-xs text-violet-900/70">Felt unsafe somewhere? Pin it anonymously, it takes a minute.</p>
                  </div>
                  <div className="flex shrink-0 flex-col gap-1.5 sm:flex-row">
                    <button onClick={startReport} className="rounded-full bg-brand px-3.5 py-1.5 text-xs font-medium text-white hover:opacity-90">
                      Report
                    </button>
                    <Link href="/invite" className="rounded-full bg-white px-3.5 py-1.5 text-center text-xs font-medium text-violet-800 hover:bg-violet-50">
                      Invite
                    </Link>
                  </div>
                </div>

                {/* Stats pill */}
                <div className="flex items-stretch rounded-[22px] bg-soft px-2 py-3.5">
                  {(
                    [
                      ["reports", "#e11d48", stats.total.toLocaleString("en-IN"), showDemo ? "Reports" : "Real reports"],
                      ["police", "#1d4ed8", (meta?.places ?? 0).toLocaleString("en-IN"), "Safe places"],
                      ["metro", "#7c3aed", stations.length.toLocaleString("en-IN"), "Metro stations"],
                    ] as const
                  ).map(([icon, color, value, label], i) => (
                    <div key={label} className={`flex flex-1 items-center justify-center gap-2.5 ${i > 0 ? "border-l border-slate-200" : ""}`}>
                      <IconBadge name={icon} color={color} size={30} />
                      <div className="text-center">
                        <p className="text-lg font-semibold leading-tight tabular-nums">{value}</p>
                        <p className="text-[11px] text-slate-500">{label}</p>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Metro station check */}
                <div>
                  <label htmlFor="station" className="mb-2 block text-sm font-semibold">
                    Metro station safety check
                  </label>
                  <div className="relative">
                    <span className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2">
                      <IconBadge name="metro" color="#7c3aed" size={28} />
                    </span>
                    <input
                      id="station"
                      list="metro-stations"
                      value={stationQuery}
                      onChange={(e) => pickStation(e.target.value)}
                      placeholder={stations.length ? `Search ${stations.length} Delhi-NCR stations…` : "Loading stations…"}
                      className="w-full rounded-full bg-soft py-3 pl-12 pr-4 text-sm outline-none ring-brand/30 placeholder:text-slate-400 focus:ring-2"
                    />
                  </div>
                  <datalist id="metro-stations">
                    {stations.map((s) => (
                      <option key={s.name} value={s.name} />
                    ))}
                  </datalist>
                </div>

                {/* Filters */}
                <div className="space-y-4">
                  <div>
                    <p className="mb-2 text-sm font-semibold">Incident type</p>
                    <div className="flex flex-wrap gap-1.5">
                      {CATEGORY_KEYS.map((c) => {
                        const on = cats.has(c);
                        return (
                          <button
                            key={c}
                            onClick={() => toggleCat(c)}
                            aria-pressed={on}
                            className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs transition ${
                              on ? "bg-soft text-slate-800" : "bg-white text-slate-400 line-through ring-1 ring-slate-200"
                            }`}
                          >
                            <span className="h-2 w-2 rounded-full" style={{ background: CATEGORIES[c].color, opacity: on ? 1 : 0.4 }} />
                            {CATEGORIES[c].short}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                  <div>
                    <p className="mb-2 text-sm font-semibold">Time of day</p>
                    <div className="flex flex-wrap gap-1.5">
                      {(["all", ...TIME_KEYS] as const).map((t) => (
                        <button
                          key={t}
                          onClick={() => setTime(t)}
                          className={`rounded-full px-3.5 py-1.5 text-xs transition ${
                            time === t ? "bg-[#111] text-white" : "bg-soft text-slate-700 hover:bg-slate-200"
                          }`}
                        >
                          {t === "all" ? "Any time" : TIMES[t].split(" (")[0]}
                        </button>
                      ))}
                    </div>
                  </div>
                  <label className="flex items-center gap-2 text-sm text-slate-600">
                    <input type="checkbox" checked={showDemo} onChange={(e) => setShowDemo(e.target.checked)} className="accent-brand" />
                    Show demo data (sample reports that show how the map works)
                  </label>
                </div>

                {/* Latest reports */}
                <div>
                  <p className="mb-2 text-sm font-semibold">Latest reports</p>
                  {recent.length === 0 &&
                    (realCount === 0 && !showDemo ? (
                      <div className="rounded-2xl bg-soft p-4 text-sm text-slate-600">
                        <p className="font-medium text-slate-800">No real reports yet.</p>
                        <p className="mt-1">
                          Every pin warns the next woman. Report a place where you felt unsafe, or{" "}
                          <Link href="/invite" className="font-medium text-brand hover:underline">
                            invite friends
                          </Link>{" "}
                          to add theirs.
                        </p>
                      </div>
                    ) : (
                      <p className="text-sm text-slate-500">No reports match these filters.</p>
                    ))}
                  <ul className="space-y-2">
                    {recent.map((r) => (
                      <li key={r.id} className="rounded-2xl bg-soft transition hover:bg-slate-100">
                        <button
                          onClick={() => {
                            setFlyTo({ lat: r.lat, lng: r.lng });
                            setFocus({ lat: r.lat, lng: r.lng });
                            setFocusLabel(null);
                            asideRef.current?.scrollTo({ top: 0, behavior: "smooth" });
                          }}
                          className="w-full p-3.5 pb-2 text-left"
                        >
                          <div className="flex items-center gap-2">
                            <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: CATEGORIES[r.category].color }} />
                            <span className="truncate text-sm font-medium">{r.title}</span>
                          </div>
                          <p className="mt-1 text-xs text-slate-500">
                            Severity {r.severity}/5 · {TIMES[r.timeOfDay].split(" (")[0]} ·{" "}
                            {new Date(r.createdAt).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
                            {r.demo && <span className="ml-1 rounded bg-amber-100 px-1 text-amber-800">demo</span>}
                          </p>
                        </button>
                        <div className="flex items-center gap-1.5 px-3.5 pb-3 text-[11px]">
                          <TrustBadge report={r} />
                          <span className="flex-1" />
                          <button onClick={() => vote(r.id, "confirm")} className="rounded-full bg-white px-2.5 py-0.5 hover:bg-emerald-50" title="I've seen this too">
                            <span className="flex items-center gap-1">
                              <Icon name="thumbsUp" size={12} color="#059669" /> {r.confirms ?? 0}
                            </span>
                          </button>
                          <button onClick={() => vote(r.id, "dispute")} className="rounded-full bg-white px-2.5 py-0.5 hover:bg-orange-50" title="Not accurate">
                            <span className="flex items-center gap-1">
                              <Icon name="flag" size={12} color="#ea580c" /> {r.disputes ?? 0}
                            </span>
                          </button>
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>

                <p className="text-[11px] text-slate-400">
                  AI: {meta?.ai === "gemini" ? "Gemini" : "rule-based fallback"} · Emergency 112 · Women Helpline 1091 / 181 ·{" "}
                  <Link href="/control" className="text-slate-500 underline hover:text-slate-700">
                    Control room (staff)
                  </Link>
                </p>
              </div>
            )}
          </aside>

          {/* Map panel */}
          <section className={`relative ${mode === "help" ? "order-2 mb-6 h-[42dvh]" : "order-1 h-[52dvh]"} mx-3 shrink-0 overflow-hidden rounded-[26px] bg-soft lg:order-2 lg:mx-0 lg:mb-5 lg:mr-5 lg:h-auto lg:flex-1 lg:rounded-[30px]`}>
            <SafetyMap
              reports={filtered}
              view={view}
              pickMode={mode === "report" || mode === "route"}
              picked={mode === "report" ? picked : null}
              focus={mode === "explore" ? focus : null}
              flyTo={flyTo}
              onMapClick={onMapClick}
              me={me}
              places={mode === "help" ? places : mode === "explore" && focus ? areaPolice : []}
              selectedPlaceId={selectedPlaceId}
              onVote={vote}
              routes={mode === "route" ? routeResult?.routes : undefined}
              selectedRouteId={routeSel}
              onSelectRoute={setRouteSel}
              routeFrom={mode === "route" ? routeFrom?.point : null}
              routeTo={mode === "route" ? routeTo?.point : null}
            />

            {/* Top-left: region pill + view switch */}
            <div className="pointer-events-none absolute left-4 right-20 top-4 z-[1000] flex flex-wrap items-center gap-2">
              <span className="pointer-events-auto hidden items-center gap-1.5 rounded-full bg-white/90 px-3.5 py-2 text-xs font-medium shadow-sm backdrop-blur sm:flex">
                IN-Delhi NCR
              </span>
              <div className="pointer-events-auto inline-flex rounded-full bg-white/90 p-1 text-xs shadow-sm backdrop-blur">
                {(["heat", "pins"] as const).map((v) => (
                  <button
                    key={v}
                    onClick={() => setView(v)}
                    className={`rounded-full px-3.5 py-1.5 font-medium transition ${view === v ? "bg-[#111] text-white" : "text-slate-600"}`}
                  >
                    {v === "heat" ? "Heatmap" : "Reports"}
                  </button>
                ))}
              </div>
              {realCount === 0 && !showDemo && (
                <button
                  onClick={() => setShowDemo(true)}
                  className="pointer-events-auto rounded-full bg-white/90 px-3.5 py-2 text-xs font-medium text-slate-700 shadow-sm"
                >
                  No real reports yet · <span className="text-brand">Show demo</span>
                </button>
              )}
            </div>

            {/* Top-right: round black location button */}
            <button
              onClick={goToMyLocation}
              disabled={locating}
              className="absolute right-4 top-4 z-[1000] grid h-11 w-11 place-items-center rounded-full bg-[#111] text-white shadow-lg transition hover:bg-black disabled:opacity-70"
              aria-label="Go to my current location"
              title="My location"
            >
              <CrosshairIcon spinning={locating} />
            </button>
            {locateMsg && (
              <div className="absolute right-4 top-[68px] z-[1000] max-w-[240px] rounded-2xl bg-[#111] px-3.5 py-2.5 text-xs text-white shadow-lg">
                {locateMsg}
              </div>
            )}

            {/* Bottom: soft orange hint pill, or toast */}
            <div className="pointer-events-none absolute bottom-5 left-4 right-16 z-[1000] flex justify-start sm:left-1/2 sm:right-auto sm:w-[380px] sm:-translate-x-1/2 sm:justify-center">
              {toast ? (
                <div role="status" className="rounded-2xl bg-[#111] px-4 py-2.5 text-center text-xs text-white shadow-lg">
                  {toast}
                </div>
              ) : (
                <div className="flex items-center gap-2 rounded-full bg-[#fde9cf] px-4 py-2 text-xs font-medium text-[#c7731b] shadow-sm">
                  <Icon name={mode === "help" ? "sos" : mode === "report" || mode === "route" ? "pin" : "sparkle"} size={14} color="#c7731b" accent="#fde9cf" />
                  {modeHint}
                </div>
              )}
            </div>
          </section>
        </main>
      </div>
    </div>
  );
}

function CrosshairIcon({ spinning }: { spinning?: boolean }) {
  return (
    <svg viewBox="0 0 24 24" className={`h-4 w-4 ${spinning ? "animate-spin" : ""}`} fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v3M12 19v3M2 12h3M19 12h3" />
    </svg>
  );
}

/** Headline word that cycles, with the next word faded after it (as in the reference design). */
function RotatingWord({ words }: { words: string[] }) {
  const [i, setI] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setI((n) => (n + 1) % words.length), 2400);
    return () => clearInterval(id);
  }, [words.length]);
  return (
    <span className="whitespace-nowrap">
      <span key={words[i]} className="word-in inline-block font-semibold text-brand">
        {words[i]}
      </span>
    </span>
  );
}

function TrustBadge({ report }: { report: Report }) {
  const status = trustStatus(report);
  if (status === "verified")
    return <span className="rounded-full bg-emerald-100 px-2 py-0.5 font-medium text-emerald-800">✓ Confirmed by {report.confirms}</span>;
  if (status === "disputed")
    return <span className="rounded-full bg-orange-100 px-2 py-0.5 font-medium text-orange-800">Disputed</span>;
  return <span className="rounded-full bg-slate-100 px-2 py-0.5 text-slate-600">Unverified</span>;
}
