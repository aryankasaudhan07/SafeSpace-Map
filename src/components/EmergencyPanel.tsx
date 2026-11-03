"use client";

import { useEffect, useRef, useState } from "react";
import { IconBadge } from "./Icon";
import { ChatGlyph, SmsGlyph } from "./ShareSheet";
import {
  CALLBACK_TIMEOUT_MS,
  cleanPhone,
  MAX_CONTACTS,
  SERVICES,
  SERVICE_KEYS,
  STATUS_LABEL,
  STATUS_ORDER,
  type AlertStatusView,
  type EmergencyProfile,
  type Service,
} from "@/lib/emergency-shared";
import { canPickContacts, pickContacts } from "@/lib/contacts";
import { buzz } from "@/lib/haptics";
import type { LatLng } from "@/lib/types";
import type { LiveShare } from "@/lib/useLiveShare";

const PROFILE_KEY = "safespace-emergency-profile";
const ALERT_KEY = "safespace-emergency-alert";
const HOLD_MS = 2000;
const POLL_MS = 4000;

interface ActiveAlert {
  id: string;
  secret: string;
  services: Service[];
  createdAt: string;
  liveUrl: string | null;
}

const EMPTY_PROFILE: EmergencyProfile = { name: "", phone: "" };

function read<T>(key: string): T | null {
  try {
    return JSON.parse(localStorage.getItem(key) ?? "null") as T | null;
  } catch {
    return null;
  }
}

function write(key: string, value: unknown) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // storage blocked: works for this visit only
  }
}

function currentPosition(): Promise<LatLng | null> {
  return new Promise((resolve) => {
    if (!navigator.geolocation) return resolve(null);
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }),
      () => resolve(null),
      // Fast answer matters more than precision here; live sharing refines the position right after.
      { enableHighAccuracy: true, timeout: 5000, maximumAge: 30_000 },
    );
  });
}

/** Message for family / friends, sent from WhatsApp or SMS to whoever the user picks. */
function contactMessage(profile: EmergencyProfile, liveUrl: string | null) {
  return [
    `EMERGENCY: ${profile.name || "I"} need${profile.name ? "s" : ""} help.`,
    liveUrl ? `Follow my live location: ${liveUrl}` : "",
    profile.phone ? `My number: ${profile.phone}` : "",
    "If you can't reach me, call 112.",
  ]
    .filter(Boolean)
    .join("\n");
}

/** Open WhatsApp / Messages with the text ready; the user picks who to send it to. */
const whatsappLink = (body: string) => `https://wa.me/?text=${encodeURIComponent(body)}`;
const smsLink = (body: string, numbers: string[] = []) => {
  if (!numbers.length) return `sms:?&body=${encodeURIComponent(body)}`;
  // iPhone and Android use different group-SMS link formats.
  return /iPhone|iPad|iPod/.test(navigator.userAgent)
    ? `sms:/open?addresses=${numbers.join(",")}&body=${encodeURIComponent(body)}`
    : `sms:${numbers.join(",")}?body=${encodeURIComponent(body)}`;
};

interface Props {
  me: LatLng | null;
  live: LiveShare;
}

/** Hold-to-send Emergency button: alerts the (demo) police and ambulance desks, starts live sharing, and has a message ready for family / friends. */
export default function EmergencyPanel({ me, live }: Props) {
  const [profile, setProfile] = useState<EmergencyProfile>(EMPTY_PROFILE);
  const [editing, setEditing] = useState(false);
  const [services, setServices] = useState<Record<Service, boolean>>({ police: true, ambulance: true });
  const [hold, setHold] = useState(0);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [active, setActive] = useState<ActiveAlert | null>(null);
  const [screenOpen, setScreenOpen] = useState(true);
  const holdTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    const saved = read<EmergencyProfile>(PROFILE_KEY);
    if (saved) setProfile(saved);
    setActive(read<ActiveAlert>(ALERT_KEY));
  }, []);

  function startHold() {
    if (sending || holdTimer.current) return;
    if (!services.police && !services.ambulance) return setError("Choose Police, Ambulance or both.");
    setError(null);
    buzz("tap");
    const started = Date.now();
    holdTimer.current = setInterval(() => {
      const p = Math.min(1, (Date.now() - started) / HOLD_MS);
      setHold(p);
      if (p >= 1) {
        stopHold();
        send();
      }
    }, 30);
  }

  function stopHold() {
    if (holdTimer.current) clearInterval(holdTimer.current);
    holdTimer.current = null;
    setHold(0);
  }

  async function send() {
    buzz("sos");
    setSending(true);
    try {
      const point = (await currentPosition()) ?? me;
      if (!point) throw new Error("We couldn't get your location. Allow location or tap the map, then try again. If you're in danger, call 112 now.");
      const shared = live.session && live.url ? { url: live.url } : await live.start(60, point, point);
      const liveUrl = shared?.url ?? null;
      const res = await fetch("/api/emergency", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...point,
          services: SERVICE_KEYS.filter((s) => services[s]),
          name: profile.name,
          phone: profile.phone,
          contacts: profile.contacts ?? [],
          liveId: liveUrl?.split("/track/")[1] ?? null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Couldn't send the alert. Call 112 now.");
      const alert: ActiveAlert = { id: data.id, secret: data.secret, services: data.services, createdAt: data.createdAt, liveUrl };
      write(ALERT_KEY, alert);
      setActive(alert);
      setScreenOpen(true);
      buzz("success");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't send the alert. Call 112 now.");
    } finally {
      setSending(false);
    }
  }

  function saveProfile(p: EmergencyProfile) {
    setProfile(p);
    write(PROFILE_KEY, p);
    setEditing(false);
  }


  return (
    <div className="space-y-3 rounded-[22px] bg-red-50 p-4">
      {active && (
        <AlertScreen
          alert={active}
          profile={profile}
          hidden={!screenOpen}
          onIncomingCall={() => setScreenOpen(true)}
          onClose={() => setScreenOpen(false)}
          onCancelled={() => {
            write(ALERT_KEY, null);
            setActive(null);
            live.stop();
          }}
        />
      )}

      {active && !screenOpen && (
        <button onClick={() => setScreenOpen(true)} className="flex w-full items-center justify-between rounded-2xl bg-red-600 px-4 py-3 text-left text-sm text-white">
          <span className="flex items-center gap-2 font-semibold">
            <span className="h-2 w-2 animate-pulse rounded-full bg-white motion-reduce:animate-none" aria-hidden />
            Emergency alert active
          </span>
          <span className="text-xs text-red-100">View status →</span>
        </button>
      )}

      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-semibold text-red-900">Emergency alert</p>
        <div className="flex gap-2 text-xs" role="group" aria-label="Send to">
          {SERVICE_KEYS.map((s) => (
            <button
              key={s}
              aria-pressed={services[s]}
              onClick={() => setServices((v) => ({ ...v, [s]: !v[s] }))}
              style={services[s] ? { background: SERVICES[s].color, borderColor: SERVICES[s].color } : undefined}
              className={`flex items-center gap-1 rounded-full border px-3 py-1.5 font-medium transition ${
                services[s] ? "text-white" : "border-slate-300 bg-white text-slate-500"
              }`}
            >
              <span aria-hidden>{services[s] ? "✓" : "+"}</span>
              {SERVICES[s].label}
            </button>
          ))}
        </div>
      </div>

      <button
        onPointerDown={startHold}
        onPointerUp={stopHold}
        onPointerLeave={stopHold}
        onPointerCancel={stopHold}
        onKeyDown={(e) => (e.key === " " || e.key === "Enter") && !e.repeat && startHold()}
        onKeyUp={stopHold}
        onContextMenu={(e) => e.preventDefault()}
        disabled={sending}
        aria-label="Hold for 2 seconds to send an emergency alert"
        className="relative w-full touch-none select-none overflow-hidden rounded-[20px] bg-red-600 py-5 text-white shadow-[0_16px_36px_-12px_rgba(220,38,38,0.8)] disabled:opacity-80"
      >
        <span className="absolute inset-y-0 left-0 bg-red-800 transition-[width] duration-75" style={{ width: `${hold * 100}%` }} aria-hidden />
        <span className="relative block text-xl font-bold tracking-wide">{sending ? "Sending alert…" : hold > 0 ? "Keep holding…" : "EMERGENCY"}</span>
        <span className="relative block text-xs text-red-100">
          {sending ? "Getting your location and starting live sharing" : "Hold for 2 seconds · alerts police and ambulance"}
        </span>
      </button>

      {error && <p className="rounded-2xl bg-white p-3 text-sm font-medium text-red-800">{error}</p>}

      {editing ? (
        <ProfileEditor profile={profile} onSave={saveProfile} onCancel={() => setEditing(false)} />
      ) : (
        <div className="flex items-center justify-between gap-2 rounded-2xl bg-white px-3 py-2.5 text-xs">
          <span className="min-w-0 truncate text-slate-600">
            {profile.phone || profile.name
              ? `${profile.name || "You"} · ${profile.phone || "no number"}${profile.contacts?.length ? ` · ${profile.contacts.length} emergency contact${profile.contacts.length === 1 ? "" : "s"}` : ""}`
              : "Add your name, number and emergency contacts"}
          </span>
          <button onClick={() => setEditing(true)} className="shrink-0 font-medium text-blue-700 hover:underline">
            {profile.phone || profile.name ? "Edit" : "Set up"}
          </button>
        </div>
      )}

      <p className="text-[11px] leading-snug text-red-900/70">
        Prototype: alerts go to SafeSpace&apos;s demo control rooms, not the real Delhi Police or 102. In real danger, always call 112.
      </p>
    </div>
  );
}

function ProfileEditor({ profile, onSave, onCancel }: { profile: EmergencyProfile; onSave: (p: EmergencyProfile) => void; onCancel: () => void }) {
  const [name, setName] = useState(profile.name);
  const [phone, setPhone] = useState(profile.phone);
  const [contacts, setContacts] = useState(profile.contacts ?? []);
  const [error, setError] = useState<string | null>(null);
  const [picker, setPicker] = useState(false);
  useEffect(() => setPicker(canPickContacts()), []);

  async function choose() {
    const picked = await pickContacts(true);
    setContacts((cs) => [...cs, ...picked.filter((p) => !cs.some((c) => c.phone === p.phone))].slice(0, MAX_CONTACTS));
  }

  function save() {
    if (phone && !cleanPhone(phone)) return setError("Check your phone number.");
    const kept = contacts.filter((c) => c.name.trim() || c.phone.trim());
    const bad = kept.find((c) => !cleanPhone(c.phone));
    if (bad) return setError(`Check the number for ${bad.name || "a contact"}.`);
    onSave({ name: name.trim(), phone: phone.trim(), contacts: kept.map((c) => ({ name: c.name.trim(), phone: c.phone.trim() })) });
  }

  const input = "min-w-0 rounded-full bg-white px-3.5 py-2 text-sm outline-none ring-red-200 focus:ring-2";
  return (
    <div className="space-y-2 rounded-2xl bg-white/60 p-3">
      <p className="text-xs font-medium text-slate-700">Your details for the control room (saved only on this phone)</p>
      <div className="grid grid-cols-2 gap-2">
        <input value={name} onChange={(e) => setName(e.target.value.slice(0, 40))} placeholder="Your name" aria-label="Your name" className={input} />
        <input value={phone} onChange={(e) => setPhone(e.target.value.slice(0, 20))} placeholder="+91 98765 43210" inputMode="tel" aria-label="Your phone number" className={input} />
      </div>
      <p className="pt-1 text-xs font-medium text-slate-700">Emergency contacts (the control room can call them)</p>
      {contacts.map((c, i) => (
        <div key={i} className="grid grid-cols-[1fr_1fr_auto] gap-2">
          <input
            value={c.name}
            onChange={(e) => setContacts((cs) => cs.map((x, j) => (j === i ? { ...x, name: e.target.value.slice(0, 30) } : x)))}
            placeholder="Name"
            aria-label={`Contact ${i + 1} name`}
            className={input}
          />
          <input
            value={c.phone}
            onChange={(e) => setContacts((cs) => cs.map((x, j) => (j === i ? { ...x, phone: e.target.value.slice(0, 20) } : x)))}
            placeholder="Phone"
            inputMode="tel"
            aria-label={`Contact ${i + 1} phone`}
            className={input}
          />
          <button onClick={() => setContacts((cs) => cs.filter((_, j) => j !== i))} aria-label={`Remove contact ${i + 1}`} className="px-2 text-slate-400 hover:text-red-600">
            ✕
          </button>
        </div>
      ))}
      {contacts.length < MAX_CONTACTS && (
        <div className="flex flex-wrap gap-2">
          {picker && (
            <button onClick={choose} className="rounded-full bg-[#111] px-3.5 py-1.5 text-xs font-medium text-white">
              Choose from contacts
            </button>
          )}
          <button onClick={() => setContacts((cs) => [...cs, { name: "", phone: "" }])} className="rounded-full bg-white px-3.5 py-1.5 text-xs font-medium text-blue-700 ring-1 ring-slate-200">
            + Type a number
          </button>
        </div>
      )}
      {!picker && contacts.length === 0 && <p className="text-[11px] text-slate-500">Picking from your phone&apos;s contacts works in Chrome on Android; elsewhere, type the number.</p>}
      {error && <p className="text-xs text-red-700">{error}</p>}
      <div className="flex gap-2 pt-1">
        <button onClick={save} className="flex-1 rounded-full bg-[#111] py-2 text-xs font-medium text-white">
          Save
        </button>
        <button onClick={onCancel} className="rounded-full bg-white px-4 py-2 text-xs text-slate-600">
          Later
        </button>
      </div>
    </div>
  );
}

/** Full-screen status after an alert is sent: what each desk has done, message for family, live sharing, cancel. */
interface ScreenProps {
  alert: ActiveAlert;
  profile: EmergencyProfile;
  /** Hidden screens keep polling, so a desk's call can bring them back */
  hidden: boolean;
  onIncomingCall: () => void;
  onClose: () => void;
  onCancelled: () => void;
}

function AlertScreen({ alert, profile, hidden, onIncomingCall, onClose, onCancelled }: ScreenProps) {
  const [view, setView] = useState<AlertStatusView | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [answering, setAnswering] = useState(false);
  const seenCall = useRef<string | null>(null);
  const message = contactMessage(profile, alert.liveUrl);

  useEffect(() => {
    let alive = true;
    let last = "";
    async function poll() {
      try {
        const res = await fetch(`/api/emergency/${alert.id}`, { headers: { "x-alert-secret": alert.secret }, cache: "no-store" });
        if (res.status === 404 || res.status === 403) return alive && onCancelled();
        if (!res.ok || !alive) return;
        const v = (await res.json()) as AlertStatusView;
        const sig = JSON.stringify(v.status);
        if (last && sig !== last) buzz("success");
        last = sig;
        // A desk just rang: ring-style vibration and bring the screen up.
        if (v.callback && !v.callback.response && seenCall.current !== v.callback.at) {
          seenCall.current = v.callback.at;
          navigator.vibrate?.([500, 300, 500, 300, 500]);
          onIncomingCall();
        }
        setView(v);
      } catch {
        // offline for a moment
      }
    }
    poll();
    const t = setInterval(poll, POLL_MS);
    return () => {
      alive = false;
      clearInterval(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [alert.id, alert.secret]);

  // The status screen owns the whole phone screen while it's open.
  useEffect(() => {
    if (hidden) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [hidden]);

  async function answer(response: "ok" | "danger") {
    setAnswering(true);
    try {
      await fetch(`/api/emergency/${alert.id}/callback`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-alert-secret": alert.secret },
        body: JSON.stringify({ response }),
      });
      setView((v) => (v?.callback ? { ...v, callback: { ...v.callback, response } } : v));
      buzz("success");
    } finally {
      setAnswering(false);
    }
  }

  async function cancel() {
    setCancelling(true);
    try {
      await fetch(`/api/emergency/${alert.id}`, { method: "DELETE", headers: { "x-alert-secret": alert.secret } });
    } finally {
      onCancelled();
    }
  }

  const time = new Date(alert.createdAt).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" });
  // A call the caller can still answer in the app (stale ones stop showing the buttons).
  const call = view?.callback && !view.cancelled && Date.now() - new Date(view.callback.at).getTime() < CALLBACK_TIMEOUT_MS * 3 ? view.callback : null;
  const contactButton = "flex h-12 items-center justify-center gap-2 rounded-full px-4 text-sm font-semibold text-white transition hover:opacity-90";

  return (
    <div
      className={`fixed inset-x-0 top-0 z-[3000] h-[100lvh] overflow-y-auto bg-canvas text-slate-900 sm:py-8 ${hidden ? "hidden" : ""}`}
      role="dialog"
      aria-modal="true"
      aria-label="Emergency alert status"
    >
      <div className="mx-auto max-w-xl space-y-4 p-5 pb-10 sm:rounded-[32px] sm:bg-white sm:p-8 sm:shadow-[0_40px_90px_-40px_rgba(15,23,42,0.35)]">
        <div className="flex items-start justify-between gap-3">
          <p className="flex items-center gap-2 rounded-full bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-700">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-500 opacity-70 motion-reduce:animate-none" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-red-600" />
            </span>
            Emergency alert active · sent {time}
          </p>
          <button onClick={onClose} className="rounded-full bg-white px-3 py-1.5 text-xs text-slate-600 ring-1 ring-slate-200 sm:bg-soft sm:ring-0">
            Hide
          </button>
        </div>

        {call && !call.response && (
          <div className="rounded-[22px] bg-accent p-4 text-[#2b1700] shadow-[0_16px_36px_-14px_rgba(243,154,50,0.9)]" role="alert">
            <p className="flex items-center gap-2 text-sm font-semibold">
              <span className="relative flex h-2.5 w-2.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#2b1700] opacity-50 motion-reduce:animate-none" />
                <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-[#2b1700]" />
              </span>
              {SERVICES[call.service].desk} is calling you now
            </p>
            <p className="mt-1 text-xs text-[#2b1700]/80">
              Answer the call from an unknown number{profile.phone ? ` on ${profile.phone}` : ""}. If you can&apos;t speak, tap below and they&apos;ll know.
            </p>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <button onClick={() => answer("ok")} disabled={answering} className="h-12 rounded-full bg-white text-sm font-semibold text-slate-900 disabled:opacity-60">
                I can talk
              </button>
              <button onClick={() => answer("danger")} disabled={answering} className="h-12 rounded-full bg-red-600 text-sm font-semibold text-white disabled:opacity-60">
                Can&apos;t talk: in danger
              </button>
            </div>
          </div>
        )}
        {call?.response && (
          <p className="rounded-full bg-white px-4 py-2 text-center text-xs text-slate-600 ring-1 ring-slate-100">
            You told the {SERVICES[call.service].desk.toLowerCase()}: {call.response === "ok" ? "you can talk" : "you can't talk and are in danger"}.
          </p>
        )}

        <div>
          <h2 className="text-[26px] font-semibold leading-tight tracking-tight">Help has been alerted</h2>
          <p className="mt-1 text-sm text-slate-500">Stay somewhere safe and busy, and keep your phone with you. This page updates by itself.</p>
        </div>

        <a
          href="tel:112"
          className="flex items-center justify-center gap-2 rounded-[20px] bg-red-600 py-4 text-lg font-bold text-white shadow-[0_16px_36px_-14px_rgba(220,38,38,0.8)] hover:bg-red-700"
        >
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor" aria-hidden>
            <path d="M6.6 10.8a15.1 15.1 0 0 0 6.6 6.6l2.2-2.2a1 1 0 0 1 1-.25 11.4 11.4 0 0 0 3.6.57 1 1 0 0 1 1 1V20a1 1 0 0 1-1 1A17 17 0 0 1 3 4a1 1 0 0 1 1-1h3.5a1 1 0 0 1 1 1c0 1.25.2 2.45.57 3.57a1 1 0 0 1-.25 1L6.6 10.8Z" />
          </svg>
          Call 112 now
        </a>

        <div className="grid gap-3 sm:grid-cols-2">
          {alert.services.map((s) => {
            const status = view?.status[s] ?? "new";
            const step = STATUS_ORDER.indexOf(status);
            const color = SERVICES[s].color;
            const done = step >= 2;
            return (
              <div key={s} className="rounded-[22px] bg-white p-4 ring-1 ring-slate-100 sm:bg-soft sm:ring-0">
                <div className="flex items-center gap-3">
                  <IconBadge name={s === "police" ? "police" : "hospital"} color={color} size={38} />
                  <div className="min-w-0">
                    <p className="text-sm font-semibold">{SERVICES[s].desk}</p>
                    <p className="text-sm font-medium" style={{ color: view?.cancelled ? "#64748b" : done ? "#059669" : color }}>
                      {view?.cancelled ? "Cancelled: you marked yourself safe" : STATUS_LABEL[s][status]}
                    </p>
                  </div>
                </div>
                <div className="mt-3 grid grid-cols-4 gap-1.5" aria-hidden>
                  {STATUS_ORDER.map((st, i) => (
                    <span key={st} className="h-1.5 rounded-full" style={{ background: i <= step ? (i >= 2 ? "#10b981" : color) : "#e2e8f0" }} />
                  ))}
                </div>
              </div>
            );
          })}
        </div>

        <div className="rounded-[22px] bg-white p-4 ring-1 ring-slate-100 sm:bg-soft sm:ring-0">
          <p className="text-sm font-semibold">Tell family or friends</p>
          <p className="mt-0.5 text-xs text-slate-500">The message with your live location is ready; choose who to send it to.</p>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <a href={whatsappLink(message)} target="_blank" rel="noreferrer" className={`${contactButton} bg-[#25d366]`}>
              <ChatGlyph className="h-5 w-5" />
              WhatsApp
            </a>
            <a href={smsLink(message, (profile.contacts ?? []).map((c) => c.phone))} className={`${contactButton} bg-[#111]`}>
              <SmsGlyph className="h-5 w-5" />
              SMS
            </a>
          </div>
          {alert.liveUrl && (
            <div className="mt-3 flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-2 text-xs text-emerald-900">
              <span className="h-2 w-2 shrink-0 rounded-full bg-emerald-500" aria-hidden />
              <span className="shrink-0 font-medium">Live location on</span>
              <a href={alert.liveUrl} target="_blank" rel="noreferrer" className="min-w-0 truncate text-emerald-700 underline">
                {alert.liveUrl.replace(/^https?:\/\//, "")}
              </a>
            </div>
          )}
        </div>

        <button
          onClick={cancel}
          disabled={cancelling}
          className="w-full rounded-full border border-slate-300 bg-white py-3 text-sm font-medium text-slate-700 hover:bg-soft disabled:opacity-60"
        >
          {cancelling ? "Cancelling…" : "I'm safe now: cancel the alert"}
        </button>
        <p className="text-center text-[11px] leading-snug text-slate-400">
          Prototype: this alert reaches SafeSpace&apos;s demo control rooms, not the real Delhi Police or 102. Always call 112 in real danger.
        </p>
      </div>
    </div>
  );
}
