"use client";

import { useEffect, useState } from "react";
import FakeCall, { detectCallStyle, primeRingtone, type CallStyle } from "./FakeCall";
import { IconBadge } from "./Icon";
import ShareSheet from "./ShareSheet";
import { buzz } from "@/lib/haptics";
import { LIVE_DURATIONS } from "@/lib/live-shared";
import { liveMessage, locationMessage, nativeShare } from "@/lib/share";
import type { LiveShare } from "@/lib/useLiveShare";
import { HELPLINES, PLACE_KINDS, directionsUrl, type AssistAdvice, type NearbyPlace, type PlaceKind } from "@/lib/safety";
import type { LatLng } from "@/lib/types";

interface Props {
  me: LatLng | null;
  onLocate: (p: LatLng) => void;
  places: NearbyPlace[];
  placesLoading: boolean;
  onShowPlace: (p: NearbyPlace) => void;
  onClose: () => void;
  live: LiveShare;
}

const QUICK = [
  "Someone is following me",
  "Cab driver changed the route",
  "I'm stranded alone at night",
  "Being harassed on the bus / metro",
];

const URGENCY_STYLE = {
  emergency: { label: "Emergency", cls: "bg-red-600 text-white" },
  urgent: { label: "Urgent", cls: "bg-orange-500 text-white" },
  caution: { label: "Stay alert", cls: "bg-amber-100 text-amber-900" },
} as const;

export default function HelpPanel({ me, onLocate, places, placesLoading, onShowPlace, onClose, live }: Props) {
  const [locating, setLocating] = useState(false);
  const [locError, setLocError] = useState<string | null>(null);
  const [situation, setSituation] = useState("");
  const [asking, setAsking] = useState(false);
  const [advice, setAdvice] = useState<AssistAdvice | null>(null);
  const [askError, setAskError] = useState<string | null>(null);
  const [fakeCall, setFakeCall] = useState(false);
  const [callStyle, setCallStyle] = useState<CallStyle>("android");
  const [caller, setCaller] = useState("Maa");
  const [callDelay, setCallDelay] = useState(10);
  // When a delayed fake call will ring (ms timestamp), so the phone can be put away first.
  const [callAt, setCallAt] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  // Default to the look of the phone this is opened on.
  useEffect(() => setCallStyle(detectCallStyle()), []);
  const [shareOpen, setShareOpen] = useState(false);
  const [shareLive, setShareLive] = useState(false);
  const [liveMinutes, setLiveMinutes] = useState<number>(LIVE_DURATIONS[1].minutes);
  // Set when "Share" was tapped before a location was known: open the share sheet once GPS answers.
  const [shareWhenLocated, setShareWhenLocated] = useState(false);

  useEffect(() => {
    if (me && shareWhenLocated) {
      setShareWhenLocated(false);
      setShareLive(false);
      setShareOpen(true);
    }
  }, [me, shareWhenLocated]);

  function locate() {
    if (!navigator.geolocation) return setLocError("Location isn't available. Tap the map to set where you are.");
    setLocating(true);
    setLocError(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        onLocate({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setLocating(false);
      },
      () => {
        setLocError("Couldn't get your location. Allow location access, or tap the map to set where you are.");
        setLocating(false);
        setShareWhenLocated(false);
      },
      { enableHighAccuracy: true, timeout: 10000 },
    );
  }

  // Delayed fake call: count down, keep the screen awake meanwhile, then ring.
  useEffect(() => {
    if (callAt === null) return;
    let wakeLock: { release: () => Promise<void> } | null = null;
    const nav = navigator as Navigator & { wakeLock?: { request: (t: "screen") => Promise<{ release: () => Promise<void> }> } };
    nav.wakeLock
      ?.request("screen")
      .then((l) => (wakeLock = l))
      .catch(() => {});
    const tick = setInterval(() => setNow(Date.now()), 500);
    const ring = setTimeout(() => {
      setCallAt(null);
      setFakeCall(true);
    }, Math.max(0, callAt - Date.now()));
    return () => {
      clearInterval(tick);
      clearTimeout(ring);
      wakeLock?.release().catch(() => {});
    };
  }, [callAt]);

  function startFakeCall() {
    buzz("tap");
    if (callDelay === 0) return setFakeCall(true);
    primeRingtone();
    setNow(Date.now());
    setCallAt(Date.now() + callDelay * 1000);
  }

  // Try to locate as soon as the panel opens.
  useEffect(() => {
    if (!me) locate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function ask(text: string) {
    if (!me) return setAskError("Set your location first (allow location or tap the map).");
    setSituation(text);
    setAsking(true);
    setAskError(null);
    setAdvice(null);
    try {
      const res = await fetch("/api/assist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...me, situation: text }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Something went wrong.");
      setAdvice(data.advice);
      buzz(data.advice.urgency === "emergency" ? "sos" : "success");
      if (data.advice.goTo) onShowPlace(data.advice.goTo);
    } catch (err) {
      setAskError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setAsking(false);
    }
  }

  /** Phone's own share menu (Quick Share, Messages, WhatsApp…) with a Google Maps link; our sheet if unavailable. */
  async function shareLocation() {
    if (!me) {
      setShareWhenLocated(true);
      locate();
      return;
    }
    const result = await nativeShare(locationMessage(me));
    if (result === "shared") buzz("success");
    if (result === "unsupported") openSheet(false);
  }

  function openSheet(forLive: boolean) {
    setShareLive(forLive);
    setShareOpen(true);
  }

  function openShareOptions() {
    if (me) openSheet(false);
    else {
      setShareWhenLocated(true);
      locate();
    }
  }

  /** Sends the live-tracking link through the phone's share menu (our sheet if it has none). */
  async function sendLiveLink(url: string, expiresAt: string) {
    if ((await nativeShare(liveMessage(url, expiresAt))) === "unsupported") openSheet(true);
  }

  async function startLive() {
    const started = await live.start(liveMinutes, me);
    if (started) {
      buzz("success");
      await sendLiveLink(started.url, started.expiresAt);
    }
  }

  const grouped = (Object.keys(PLACE_KINDS) as PlaceKind[])
    .map((kind) => ({ kind, items: places.filter((p) => p.kind === kind) }))
    .filter((g) => g.items.length > 0);

  return (
    <div className="space-y-5">
      {shareOpen && me && (
        <ShareSheet
          point={me}
          live={shareLive && live.url && live.session ? { url: live.url, expiresAt: live.session.expiresAt } : undefined}
          onClose={() => setShareOpen(false)}
        />
      )}
      {fakeCall && <FakeCall caller={caller.trim() || "Maa"} style={callStyle} onEnd={() => setFakeCall(false)} />}

      <div className="flex items-start justify-between gap-2">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight text-red-600">Help now</h2>
          <p className="text-sm text-slate-500">If you are in danger, call 112 first.</p>
        </div>
        <button onClick={onClose} className="text-sm text-slate-500 hover:underline">
          Close
        </button>
      </div>

      {/* One-tap helplines */}
      <div className="grid grid-cols-2 gap-2">
        {HELPLINES.map((h, i) => (
          <a
            key={h.number}
            href={`tel:${h.number}`}
            className={`rounded-[20px] p-3.5 ${i === 0 ? "col-span-2 bg-red-600 text-white hover:bg-red-700" : "bg-red-50 text-red-900 hover:bg-red-100"}`}
          >
            <p className="text-xl font-bold leading-none">{h.number}</p>
            <p className="mt-1 text-xs font-medium">{h.label}</p>
            <p className={`text-[11px] ${i === 0 ? "text-red-100" : "text-red-800/70"}`}>{h.detail}</p>
          </a>
        ))}
      </div>

      {/* Location + share + fake call */}
      <div className="rounded-[22px] bg-soft p-4 text-sm">
        <div className="flex items-center justify-between gap-2">
          <p className="flex items-center gap-2 font-medium">
            <IconBadge name="pin" color={me ? "#2563eb" : "#94a3b8"} size={24} />
            {me ? "Your location is set" : locating ? "Finding your location…" : "Location not set"}
          </p>
          <button onClick={locate} className="text-xs font-medium text-blue-700 hover:underline">
            {me ? "Update" : "Use GPS"}
          </button>
        </div>
        {locError && !me && <p className="mt-1 text-xs text-red-700">{locError}</p>}
        {!me && !locError && <p className="mt-1 text-xs text-slate-500">Or tap the map to set where you are.</p>}
        <div className="mt-3 grid grid-cols-[1fr_auto] gap-2">
          <button
            onClick={shareLocation}
            disabled={locating}
            className="flex items-center justify-center gap-2 rounded-full bg-emerald-600 px-3 py-2.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-70"
          >
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M12 3v12M7 8l5-5 5 5M5 13v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6" />
            </svg>
            {locating && shareWhenLocated ? "Getting your location…" : "Share my location"}
          </button>
          <button
            onClick={openShareOptions}
            disabled={locating}
            className="rounded-full border border-emerald-600 bg-white px-4 py-2.5 text-xs font-medium text-emerald-700 hover:bg-emerald-50 disabled:opacity-70"
          >
            More options
          </button>
        </div>
        <p className="mt-2 text-[11px] text-slate-500">Sends a Google Maps link via Quick Share, Messages, WhatsApp and more.</p>
      </div>

      {/* Live location */}
      <LiveCard
        live={live}
        minutes={liveMinutes}
        onMinutes={setLiveMinutes}
        onStart={startLive}
        onResend={() => live.url && live.session && sendLiveLink(live.url, live.session.expiresAt)}
      />

      {/* Fake call */}
      <div className="rounded-[22px] bg-soft p-4 text-sm">
        <p className="flex items-center gap-2 font-medium">
          <IconBadge name="phone" color="#111" size={24} /> Fake incoming call
        </p>
        <p className="mt-0.5 text-xs text-slate-500">A realistic call screen to help you get away from someone.</p>
        <div className="mt-3 flex items-center gap-2">
          <div className="inline-flex shrink-0 rounded-full bg-white p-1 text-xs" role="radiogroup" aria-label="Phone style">
            {(
              [
                ["android", "Android"],
                ["ios", "iPhone"],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                role="radio"
                aria-checked={callStyle === value}
                onClick={() => setCallStyle(value)}
                className={`rounded-full px-3 py-1.5 font-medium transition ${callStyle === value ? "bg-[#111] text-white" : "text-slate-600"}`}
              >
                {label}
              </button>
            ))}
          </div>
          <input
            value={caller}
            onChange={(e) => setCaller(e.target.value.slice(0, 24))}
            aria-label="Caller name"
            placeholder="Caller name"
            className="min-w-0 flex-1 rounded-full bg-white px-3.5 py-2 text-xs outline-none ring-brand/30 focus:ring-2"
          />
        </div>
        <div className="mt-2.5 flex items-center gap-2 text-xs">
          <span className="text-slate-500">Ring</span>
          <div className="inline-flex rounded-full bg-white p-1" role="radiogroup" aria-label="Ring after">
            {(
              [
                [0, "Now"],
                [10, "10 s"],
                [30, "30 s"],
                [60, "1 min"],
              ] as const
            ).map(([sec, label]) => (
              <button
                key={sec}
                role="radio"
                aria-checked={callDelay === sec}
                onClick={() => setCallDelay(sec)}
                className={`rounded-full px-3 py-1.5 font-medium transition ${callDelay === sec ? "bg-[#111] text-white" : "text-slate-600"}`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        {callAt !== null ? (
          <div className="mt-2.5 flex items-center justify-between gap-2 rounded-full bg-white py-1.5 pl-4 pr-1.5 text-xs" role="status">
            <span>
              {caller.trim() || "Maa"} calls in <strong className="tabular-nums">{Math.max(0, Math.ceil((callAt - now) / 1000))} s</strong>. Keep the screen on.
            </span>
            <button onClick={() => setCallAt(null)} className="rounded-full bg-soft px-3 py-1.5 font-medium text-slate-700">
              Cancel
            </button>
          </div>
        ) : (
          <button
            onClick={startFakeCall}
            className="mt-2.5 w-full rounded-full bg-[#111] px-3 py-2.5 text-xs font-medium text-white hover:bg-black"
          >
            {callDelay === 0 ? `Start fake call from ${caller.trim() || "Maa"}` : `Fake call from ${caller.trim() || "Maa"} in ${callDelay < 60 ? `${callDelay} s` : "1 min"}`}
          </button>
        )}
      </div>

      {/* AI assistant */}
      <div className="rounded-[22px] bg-[#f3f0fe] p-4">
        <p className="text-sm font-semibold text-violet-900">What&apos;s happening? AI will tell you what to do</p>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {QUICK.map((q) => (
            <button
              key={q}
              onClick={() => ask(q)}
              disabled={asking}
              className="rounded-full bg-white px-3 py-1.5 text-xs text-violet-800 hover:bg-violet-100 disabled:opacity-50"
            >
              {q}
            </button>
          ))}
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (situation.trim()) ask(situation.trim());
          }}
          className="mt-2 flex gap-2"
        >
          <input
            value={situation}
            onChange={(e) => setSituation(e.target.value)}
            placeholder="Describe in English / Hindi / Hinglish"
            className="min-w-0 flex-1 rounded-full bg-white px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-violet-200"
          />
          <button disabled={asking} className="rounded-full bg-brand px-4 text-sm font-medium text-white disabled:opacity-60">
            {asking ? "…" : "Ask"}
          </button>
        </form>
        {asking && <p className="mt-2 text-xs text-violet-700">Gemini is checking your surroundings…</p>}
        {askError && <p className="mt-2 text-xs text-red-700">{askError}</p>}

        {advice && (
          <div className="mt-3 space-y-3 rounded-[20px] bg-white p-4 shadow-sm">
            <div className="flex items-center gap-2">
              <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${URGENCY_STYLE[advice.urgency].cls}`}>
                {URGENCY_STYLE[advice.urgency].label}
              </span>
            </div>
            <p className="font-semibold leading-snug">{advice.headline}</p>
            {advice.callNumber && (
              <a href={`tel:${advice.callNumber}`} className="block rounded-full bg-red-600 py-2.5 text-center text-sm font-semibold text-white">
                Call {advice.callNumber} now
              </a>
            )}
            <ol className="list-decimal space-y-1 pl-5 text-sm text-slate-700">
              {advice.steps.map((s) => (
                <li key={s}>{s}</li>
              ))}
            </ol>
            {advice.goTo && (
              <div className="rounded-2xl bg-blue-50 p-3 text-sm">
                <p className="text-xs font-medium text-blue-800">Go here</p>
                <p className="mt-1 flex items-center gap-2 font-semibold">
                  <IconBadge name={PLACE_KINDS[advice.goTo.kind].icon} color={PLACE_KINDS[advice.goTo.kind].color} size={24} />
                  {advice.goTo.name}
                </p>
                <p className="text-xs text-slate-600">
                  {advice.goTo.distanceKm} km · ~{advice.goTo.walkMin} min walk · {advice.goToReason}
                </p>
                <a href={directionsUrl(advice.goTo)} target="_blank" rel="noreferrer" className="mt-1.5 inline-block text-xs font-semibold text-blue-700 hover:underline">
                  Get directions →
                </a>
              </div>
            )}
            <p className="text-sm italic text-slate-600">{advice.reassurance}</p>
            <p className="text-[11px] text-slate-400">
              {advice.aiSource === "gemini" ? `Advice by ${advice.aiModel ?? "Gemini"}` : "Rule-based advice (AI unavailable)"}
            </p>
          </div>
        )}
      </div>

      {/* Nearest safe places */}
      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Nearest safe places</p>
        {!me && <p className="text-sm text-slate-500">Set your location to see police stations, hospitals and other safe places near you.</p>}
        {me && placesLoading && <p className="text-sm text-slate-500">Finding safe places…</p>}
        {me && !placesLoading && places.length === 0 && (
          <p className="text-sm text-slate-500">No safe places in our Delhi dataset within 6 km. Tap the map in Delhi to try it.</p>
        )}
        <div className="space-y-4">
          {grouped.map((g) => (
            <div key={g.kind}>
              <p className="mb-2 flex items-center gap-2 text-sm font-medium">
                <IconBadge name={PLACE_KINDS[g.kind].icon} color={PLACE_KINDS[g.kind].color} size={26} />
                {PLACE_KINDS[g.kind].label}
              </p>
              <ul className="space-y-1.5">
                {g.items.map((p) => (
                  <li key={p.id} className="flex items-center justify-between gap-2 rounded-2xl bg-soft p-3">
                    <button onClick={() => onShowPlace(p)} className="min-w-0 text-left">
                      <p className="truncate text-sm font-medium">{p.name}</p>
                      <p className="text-xs text-slate-500">
                        {p.distanceKm} km · ~{p.walkMin} min walk{p.open24 ? " · 24×7" : ""}
                      </p>
                    </button>
                    <div className="flex shrink-0 gap-1.5">
                      {p.phone && (
                        <a href={`tel:${p.phone}`} className="rounded-full bg-white px-3 py-1 text-xs font-medium" aria-label={`Call ${p.name}`}>
                          Call
                        </a>
                      )}
                      <a
                        href={directionsUrl(p)}
                        target="_blank"
                        rel="noreferrer"
                        className="rounded-full bg-[#111] px-3.5 py-1 text-xs font-medium text-white"
                      >
                        Go
                      </a>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        {places.length > 0 && <p className="mt-2 text-[11px] text-slate-400">Place data © OpenStreetMap contributors</p>}
      </div>
    </div>
  );
}

const clock = (iso: string) => new Date(iso).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" });

interface LiveCardProps {
  live: LiveShare;
  minutes: number;
  onMinutes: (m: number) => void;
  onStart: () => void;
  onResend: () => void;
}

/** Start/stop live location sharing, and what is being shared right now. */
function LiveCard({ live, minutes, onMinutes, onStart, onResend }: LiveCardProps) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!live.session) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [live.session]);

  if (live.session) {
    const sentAgo = live.lastSentAt ? Math.max(0, Math.round((now - live.lastSentAt) / 1000)) : null;
    return (
      <div className="rounded-[22px] bg-emerald-50 p-4 text-sm text-emerald-950">
        <p className="flex items-center gap-2 font-semibold">
          <span className="relative flex h-2.5 w-2.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500 opacity-60 motion-reduce:animate-none" />
            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500" />
          </span>
          Sharing live location until {clock(live.session.expiresAt)}
        </p>
        <p className="mt-0.5 text-xs text-emerald-900/75">
          {live.following ? "Following your GPS" : "GPS off: sharing the point you set on the map"}
          {sentAgo !== null ? ` · last sent ${sentAgo} s ago` : " · connecting…"}
        </p>
        <p className="mt-1 text-[11px] text-emerald-900/60">Keep this page open so your position keeps updating.</p>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <button onClick={onResend} className="rounded-full bg-emerald-600 py-2.5 text-xs font-semibold text-white hover:bg-emerald-700">
            Send link again
          </button>
          <button
            onClick={live.stop}
            className="rounded-full border border-red-600 bg-white py-2.5 text-xs font-semibold text-red-700 hover:bg-red-50"
          >
            Stop sharing
          </button>
        </div>
        {live.url && (
          <a href={live.url} target="_blank" rel="noreferrer" className="mt-2 block truncate text-center text-[11px] text-emerald-800 hover:underline">
            {live.url.replace(/^https?:\/\//, "")}
          </a>
        )}
      </div>
    );
  }

  return (
    <div className="rounded-[22px] bg-soft p-4 text-sm">
      <p className="flex items-center gap-2 font-medium">
        <IconBadge name="pin" color="#059669" size={24} /> Share live location
      </p>
      <p className="mt-0.5 text-xs text-slate-500">Family or friends follow you on a map until you stop. It ends automatically.</p>
      <div className="mt-3 flex items-center gap-2">
        <div className="inline-flex rounded-full bg-white p-1 text-xs" role="radiogroup" aria-label="Share for">
          {LIVE_DURATIONS.map((d) => (
            <button
              key={d.minutes}
              role="radio"
              aria-checked={minutes === d.minutes}
              onClick={() => onMinutes(d.minutes)}
              className={`rounded-full px-3 py-1.5 font-medium transition ${minutes === d.minutes ? "bg-[#111] text-white" : "text-slate-600"}`}
            >
              {d.label}
            </button>
          ))}
        </div>
      </div>
      <button
        onClick={onStart}
        disabled={live.starting}
        className="mt-2.5 w-full rounded-full bg-emerald-600 px-3 py-2.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-70"
      >
        {live.starting ? "Starting…" : "Start live sharing"}
      </button>
      {live.error && <p className="mt-2 text-xs text-red-700">{live.error}</p>}
    </div>
  );
}
