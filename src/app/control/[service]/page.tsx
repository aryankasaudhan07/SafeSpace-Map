"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { IconBadge } from "@/components/Icon";
import Logo from "@/components/Logo";
import {
  NEXT_ACTION,
  SERVICES,
  SERVICE_KEYS,
  STATUS_LABEL,
  STATUS_ORDER,
  type AlertStatus,
  type ControlAlert,
  type Service,
} from "@/lib/emergency-shared";

const ControlMap = dynamic(() => import("@/components/ControlMap"), {
  ssr: false,
  loading: () => <div className="flex h-full items-center justify-center text-sm text-slate-400">Loading map…</div>,
});

const PASS_KEY = "safespace-control-passcode";
const POLL_MS = 4000;

const STATUS_CHIP: Record<AlertStatus, string> = {
  new: "bg-red-600 text-white",
  seen: "bg-amber-100 text-amber-900",
  dispatched: "bg-blue-100 text-blue-900",
  resolved: "bg-slate-100 text-slate-600",
};

function ago(iso: string, now: number) {
  const s = Math.max(0, Math.round((now - new Date(iso).getTime()) / 1000));
  if (s < 60) return `${s} s ago`;
  const m = Math.round(s / 60);
  return m < 60 ? `${m} min ago` : `${Math.round(m / 60)} h ago`;
}

/** Short alarm when a new alert arrives (audio is unlocked by the passcode tap). */
function useAlarm() {
  const ctx = useRef<AudioContext | null>(null);
  return {
    unlock() {
      try {
        ctx.current ??= new AudioContext();
        ctx.current.resume().catch(() => {});
      } catch {
        // no audio
      }
    },
    ring() {
      const c = ctx.current;
      if (!c) return;
      [0, 0.25, 0.5].forEach((at) => {
        const osc = c.createOscillator();
        const gain = c.createGain();
        osc.frequency.value = 880;
        const t = c.currentTime + at;
        gain.gain.setValueAtTime(0.0001, t);
        gain.gain.exponentialRampToValueAtTime(0.25, t + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.2);
        osc.connect(gain).connect(c.destination);
        osc.start(t);
        osc.stop(t + 0.22);
      });
    },
  };
}

/** Demo control-room desk for the police or ambulance service. */
export default function ControlPage() {
  const params = useParams<{ service: string }>();
  const service = (SERVICE_KEYS.includes(params.service as Service) ? params.service : null) as Service | null;
  const [passcode, setPasscode] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [alerts, setAlerts] = useState<ControlAlert[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [busy, setBusy] = useState<string | null>(null);
  const seen = useRef<Set<string> | null>(null);
  const alarm = useAlarm();

  useEffect(() => {
    try {
      setPasscode(sessionStorage.getItem(PASS_KEY));
    } catch {
      // storage blocked: ask every time
    }
  }, []);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  // Poll for alerts while signed in.
  useEffect(() => {
    if (!passcode || !service) return;
    let alive = true;
    async function poll() {
      try {
        const res = await fetch(`/api/control/alerts?service=${service}`, { headers: { "x-control-passcode": passcode! }, cache: "no-store" });
        const data = await res.json();
        if (!alive) return;
        if (!res.ok) {
          setError(data.error);
          if (res.status === 401) signOut();
          return;
        }
        const list = data.alerts as ControlAlert[];
        const fresh = list.filter((a) => !a.cancelled && a.status[service!] === "new" && !seen.current?.has(a.id));
        if (seen.current && fresh.length) {
          alarm.ring();
          setSelectedId(fresh[0].id);
        } else if (!seen.current) {
          // Desk just opened: focus the newest alert that still needs action.
          const open = list.find((a) => !a.cancelled && a.status[service!] !== "resolved");
          if (open) setSelectedId(open.id);
        }
        seen.current = new Set(list.map((a) => a.id));
        setAlerts(list);
        setError(null);
      } catch {
        if (alive) setError("Connection lost. Retrying…");
      }
    }
    poll();
    const t = setInterval(poll, POLL_MS);
    return () => {
      alive = false;
      clearInterval(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [passcode, service]);

  function signIn(e: React.FormEvent) {
    e.preventDefault();
    alarm.unlock();
    const p = input.trim();
    if (!p) return;
    try {
      sessionStorage.setItem(PASS_KEY, p);
    } catch {
      // keep in memory only
    }
    seen.current = null;
    setPasscode(p);
  }

  function signOut() {
    try {
      sessionStorage.removeItem(PASS_KEY);
    } catch {
      // nothing stored
    }
    setPasscode(null);
    setAlerts([]);
  }

  async function advance(a: ControlAlert) {
    if (!service || !passcode) return;
    const current = a.status[service] ?? "new";
    const next = STATUS_ORDER[STATUS_ORDER.indexOf(current) + 1];
    if (!next) return;
    setBusy(a.id);
    try {
      const res = await fetch(`/api/control/alerts/${a.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", "x-control-passcode": passcode },
        body: JSON.stringify({ service, status: next }),
      });
      if (res.ok) setAlerts((list) => list.map((x) => (x.id === a.id ? { ...x, status: { ...x.status, [service]: next } } : x)));
    } finally {
      setBusy(null);
    }
  }

  if (!service) {
    return (
      <main className="grid min-h-dvh place-items-center bg-canvas p-6 text-center">
        <p>Unknown desk. Open <Link href="/control/police" className="text-brand underline">/control/police</Link> or <Link href="/control/ambulance" className="text-brand underline">/control/ambulance</Link>.</p>
      </main>
    );
  }

  const desk = SERVICES[service];
  const other = SERVICE_KEYS.find((s) => s !== service)!;
  const open = alerts.filter((a) => !a.cancelled && a.status[service] !== "resolved");
  const counts = {
    new: open.filter((a) => a.status[service] === "new").length,
    active: open.filter((a) => a.status[service] !== "new").length,
    closed: alerts.length - open.length,
  };

  return (
    <div className="flex min-h-dvh flex-col bg-canvas text-slate-900 md:h-dvh lg:p-5">
      <div className="mx-auto flex min-h-0 w-full max-w-[1520px] flex-1 flex-col bg-white md:overflow-hidden lg:rounded-[36px] lg:shadow-[0_40px_90px_-40px_rgba(15,23,42,0.35)]">
        <header className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 lg:px-8">
          <div className="flex items-center gap-3">
            <Logo />
            <div>
              <p className="text-[17px] font-semibold leading-tight">SafeSpace Response · {desk.desk}</p>
              <p className="text-xs text-slate-500">Receives Emergency alerts from SafeSpace Map</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-amber-100 px-3 py-1.5 text-xs font-semibold text-amber-900">
              DEMO: not connected to the real Delhi Police or 102
            </span>
            <Link href={`/control/${other}`} className="rounded-full border border-slate-200 px-3.5 py-1.5 text-xs font-medium hover:bg-soft">
              {SERVICES[other].desk} →
            </Link>
            {passcode && (
              <button onClick={signOut} className="rounded-full px-3 py-1.5 text-xs text-slate-500 hover:underline">
                Sign out
              </button>
            )}
          </div>
        </header>

        {!passcode ? (
          <form onSubmit={signIn} className="mx-auto mt-16 w-full max-w-sm space-y-3 px-5 text-center">
            <IconBadge name={service === "police" ? "police" : "hospital"} color={desk.color} size={52} />
            <h1 className="text-2xl font-semibold">{desk.desk}</h1>
            <p className="text-sm text-slate-500">Enter the desk passcode. Alerts include callers&apos; phone numbers and live locations.</p>
            <input
              type="password"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Passcode"
              aria-label="Passcode"
              autoFocus
              className="w-full rounded-full bg-soft px-5 py-3 text-center outline-none ring-brand/30 focus:ring-2"
            />
            {error && <p className="text-sm text-red-700">{error}</p>}
            <button className="w-full rounded-full bg-[#111] py-3 text-sm font-medium text-white">Open desk</button>
          </form>
        ) : (
          <main className="flex min-h-0 flex-1 flex-col md:flex-row">
            <aside className="order-2 min-h-0 space-y-3 px-5 pb-8 pt-4 md:order-1 md:w-[360px] md:shrink-0 md:overflow-y-auto md:pt-0 lg:w-[460px] lg:px-8">
              <div className="grid grid-cols-3 gap-2 text-center">
                {(
                  [
                    ["New", counts.new, "text-red-600"],
                    ["In progress", counts.active, "text-blue-700"],
                    ["Closed today", counts.closed, "text-slate-500"],
                  ] as const
                ).map(([label, n, cls]) => (
                  <div key={label} className="rounded-[18px] bg-soft py-3">
                    <p className={`text-2xl font-semibold tabular-nums ${cls}`}>{n}</p>
                    <p className="text-[11px] text-slate-500">{label}</p>
                  </div>
                ))}
              </div>
              {error && <p className="rounded-2xl bg-red-50 p-3 text-sm text-red-800">{error}</p>}
              {alerts.length === 0 && !error && (
                <div className="rounded-[22px] bg-soft p-5 text-sm text-slate-600">
                  <p className="font-medium text-slate-800">No alerts in the last 24 hours.</p>
                  <p className="mt-1">This desk updates every few seconds and sounds an alarm when an Emergency alert arrives.</p>
                </div>
              )}
              <ul className="space-y-2">
                {alerts.map((a) => (
                  <AlertCard
                    key={a.id}
                    alert={a}
                    service={service}
                    now={now}
                    selected={a.id === selectedId}
                    busy={busy === a.id}
                    onSelect={() => setSelectedId(a.id)}
                    onAdvance={() => advance(a)}
                  />
                ))}
              </ul>
            </aside>
            <section className="relative order-1 mx-3 h-[45dvh] shrink-0 overflow-hidden rounded-[26px] bg-soft md:order-2 md:mx-0 md:mb-5 md:mr-5 md:h-auto md:min-h-[520px] md:flex-1 lg:rounded-[30px]">
              <ControlMap alerts={alerts} service={service} selectedId={selectedId} onSelect={setSelectedId} />
            </section>
          </main>
        )}
      </div>
    </div>
  );
}

function AlertCard({
  alert: a,
  service,
  now,
  selected,
  busy,
  onSelect,
  onAdvance,
}: {
  alert: ControlAlert;
  service: Service;
  now: number;
  selected: boolean;
  busy: boolean;
  onSelect: () => void;
  onAdvance: () => void;
}) {
  const status = a.status[service] ?? "new";
  const nearest = service === "police" ? a.nearestPolice : a.nearestHospital;
  const action = NEXT_ACTION[service][status];
  const others = a.services.filter((s) => s !== service);

  return (
    <li
      onClick={onSelect}
      className={`cursor-pointer rounded-[22px] p-4 transition ${
        selected ? "bg-white shadow-[0_12px_32px_-12px_rgba(15,23,42,0.35)] ring-2 ring-slate-900" : a.cancelled ? "bg-soft opacity-70" : status === "new" ? "bg-red-50" : "bg-soft"
      }`}
    >
      <div className="flex flex-wrap items-center gap-1.5">
        {a.cancelled ? (
          <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-900">Caller marked safe</span>
        ) : (
          <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${STATUS_CHIP[status]}`}>{STATUS_LABEL[service][status]}</span>
        )}
        {a.live && <span className="rounded-full bg-emerald-600 px-2.5 py-0.5 text-[11px] font-semibold text-white">● Live location</span>}
        {others.map((s) => (
          <span key={s} className="rounded-full bg-white px-2.5 py-0.5 text-[11px] text-slate-600">
            Also sent to {SERVICES[s].label.toLowerCase()}
          </span>
        ))}
        <span className="ml-auto text-xs text-slate-500">{ago(a.createdAt, now)}</span>
      </div>

      <p className="mt-2 text-[15px] font-semibold">{a.name || "Unnamed caller"}</p>
      <p className="text-sm text-slate-600">{a.phone ?? "No phone number given"}</p>
      {a.note && <p className="mt-1 text-sm text-slate-700">“{a.note}”</p>}
      {nearest && (
        <p className="mt-1 text-xs text-slate-500">
          Nearest {service === "police" ? "police station" : "hospital"}: {nearest.name} · {nearest.distanceKm} km
        </p>
      )}

      <div className="mt-3 flex flex-wrap gap-2" onClick={(e) => e.stopPropagation()}>
        {!a.cancelled && action && (
          <button onClick={onAdvance} disabled={busy} className="rounded-full bg-[#111] px-4 py-2 text-xs font-semibold text-white disabled:opacity-60">
            {busy ? "Updating…" : action}
          </button>
        )}
        {a.phone && (
          <a href={`tel:${a.phone}`} className="rounded-full bg-white px-4 py-2 text-xs font-medium ring-1 ring-slate-200">
            Call caller
          </a>
        )}
        {a.liveId && (
          <a href={`/track/${a.liveId}`} target="_blank" rel="noreferrer" className="rounded-full bg-white px-4 py-2 text-xs font-medium ring-1 ring-slate-200">
            Open live tracking
          </a>
        )}
        <a
          href={`https://www.google.com/maps/dir/?api=1&destination=${(a.live ?? a).lat},${(a.live ?? a).lng}`}
          target="_blank"
          rel="noreferrer"
          className="rounded-full bg-white px-4 py-2 text-xs font-medium ring-1 ring-slate-200"
        >
          Directions
        </a>
      </div>
    </li>
  );
}
