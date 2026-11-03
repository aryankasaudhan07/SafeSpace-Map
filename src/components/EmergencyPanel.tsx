"use client";

import { useEffect, useRef, useState } from "react";
import { IconBadge } from "./Icon";
import {
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

const EMPTY_PROFILE: EmergencyProfile = { name: "", phone: "", contacts: [] };

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

/** Text for trusted contacts. */
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

/** One SMS to every trusted contact (iPhone and Android use different group-SMS link formats). */
function smsAllLink(numbers: string[], body: string) {
  const ios = /iPhone|iPad|iPod/.test(navigator.userAgent);
  const to = numbers.join(",");
  return ios ? `sms:/open?addresses=${to}&body=${encodeURIComponent(body)}` : `sms:${to}?body=${encodeURIComponent(body)}`;
}

const waLink = (phone: string, body: string) => `https://wa.me/${phone.replace(/\D/g, "")}?text=${encodeURIComponent(body)}`;

interface Props {
  me: LatLng | null;
  live: LiveShare;
}

/** Hold-to-send Emergency button: alerts the (demo) police and ambulance desks, starts live sharing, lines up messages to trusted contacts. */
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
    else setEditing(true);
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

  const contactCount = profile.contacts.length;

  return (
    <div className="space-y-3 rounded-[22px] bg-red-50 p-4">
      {active && screenOpen && (
        <AlertScreen
          alert={active}
          profile={profile}
          onClose={() => setScreenOpen(false)}
          onCancelled={() => {
            write(ALERT_KEY, null);
            setActive(null);
            live.stop();
          }}
        />
      )}

      {active && !screenOpen && (
        <button onClick={() => setScreenOpen(true)} className="flex w-full items-center justify-between rounded-2xl bg-[#1b0b0b] px-4 py-3 text-left text-sm text-white">
          <span className="font-semibold">Emergency alert active</span>
          <span className="text-xs text-red-300">View status →</span>
        </button>
      )}

      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-semibold text-red-900">Emergency alert</p>
        <div className="inline-flex rounded-full bg-white p-1 text-xs" role="group" aria-label="Send to">
          {SERVICE_KEYS.map((s) => (
            <button
              key={s}
              aria-pressed={services[s]}
              onClick={() => setServices((v) => ({ ...v, [s]: !v[s] }))}
              className={`rounded-full px-3 py-1.5 font-medium transition ${services[s] ? "bg-red-600 text-white" : "text-slate-500"}`}
            >
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
          {sending ? "Getting your location and starting live sharing" : "Hold for 2 seconds · alerts help and your contacts"}
        </span>
      </button>

      {error && <p className="rounded-2xl bg-white p-3 text-sm font-medium text-red-800">{error}</p>}

      {editing ? (
        <ProfileEditor profile={profile} onSave={saveProfile} onCancel={() => setEditing(false)} />
      ) : (
        <div className="flex items-center justify-between gap-2 rounded-2xl bg-white px-3 py-2.5 text-xs">
          <span className="min-w-0 truncate text-slate-600">
            {profile.phone || profile.name ? `${profile.name || "You"} · ${profile.phone || "no number"}` : "Your details aren't set"} ·{" "}
            {contactCount} trusted contact{contactCount === 1 ? "" : "s"}
          </span>
          <button onClick={() => setEditing(true)} className="shrink-0 font-medium text-blue-700 hover:underline">
            Edit
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
  const [contacts, setContacts] = useState(profile.contacts.length ? profile.contacts : [{ name: "", phone: "" }]);
  const [error, setError] = useState<string | null>(null);

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
      <p className="text-xs font-medium text-slate-700">Your details (saved only on this phone)</p>
      <div className="grid grid-cols-2 gap-2">
        <input value={name} onChange={(e) => setName(e.target.value.slice(0, 40))} placeholder="Your name" aria-label="Your name" className={input} />
        <input value={phone} onChange={(e) => setPhone(e.target.value.slice(0, 20))} placeholder="+91 98765 43210" inputMode="tel" aria-label="Your phone number" className={input} />
      </div>
      <p className="pt-1 text-xs font-medium text-slate-700">Trusted contacts</p>
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
        <button onClick={() => setContacts((cs) => [...cs, { name: "", phone: "" }])} className="text-xs font-medium text-blue-700 hover:underline">
          + Add contact
        </button>
      )}
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

/** Full-screen status after an alert is sent: what each desk has done, contacts, live sharing, cancel. */
function AlertScreen({ alert, profile, onClose, onCancelled }: { alert: ActiveAlert; profile: EmergencyProfile; onClose: () => void; onCancelled: () => void }) {
  const [view, setView] = useState<AlertStatusView | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const message = contactMessage(profile, alert.liveUrl);
  const numbers = profile.contacts.map((c) => c.phone);

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
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  async function cancel() {
    setCancelling(true);
    try {
      await fetch(`/api/emergency/${alert.id}`, { method: "DELETE", headers: { "x-alert-secret": alert.secret } });
    } finally {
      onCancelled();
    }
  }

  const time = new Date(alert.createdAt).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" });

  return (
    <div className="fixed inset-x-0 top-0 z-[3000] h-[100lvh] overflow-y-auto bg-[#1b0b0b] text-white" role="dialog" aria-modal="true" aria-label="Emergency alert status">
      <div className="mx-auto max-w-md space-y-4 p-5 pb-10">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="flex items-center gap-2 text-sm font-semibold text-red-300">
              <span className="relative flex h-2.5 w-2.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-70 motion-reduce:animate-none" />
                <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-red-500" />
              </span>
              Emergency alert active · sent {time}
            </p>
            <h2 className="mt-1 text-2xl font-semibold">Help has been alerted</h2>
          </div>
          <button onClick={onClose} className="rounded-full bg-white/10 px-3 py-1 text-xs">
            Hide
          </button>
        </div>

        <a href="tel:112" className="block rounded-[20px] bg-red-600 py-4 text-center text-lg font-bold">
          Call 112 now
        </a>

        <div className="space-y-2">
          {alert.services.map((s) => {
            const status = view?.status[s] ?? "new";
            const step = STATUS_ORDER.indexOf(status);
            return (
              <div key={s} className="rounded-[20px] bg-white/[0.07] p-4">
                <div className="flex items-center gap-3">
                  <IconBadge name={s === "police" ? "police" : "hospital"} color={SERVICES[s].color} size={34} />
                  <div className="min-w-0">
                    <p className="text-sm font-semibold">{SERVICES[s].desk}</p>
                    <p className={`text-sm ${step >= 2 ? "text-emerald-300" : "text-white/70"}`}>{view?.cancelled ? "Cancelled: you marked yourself safe" : STATUS_LABEL[s][status]}</p>
                  </div>
                </div>
                <div className="mt-3 grid grid-cols-4 gap-1" aria-hidden>
                  {STATUS_ORDER.map((st, i) => (
                    <span key={st} className={`h-1.5 rounded-full ${i <= step ? (i >= 2 ? "bg-emerald-400" : "bg-red-400") : "bg-white/15"}`} />
                  ))}
                </div>
              </div>
            );
          })}
        </div>

        <div className="rounded-[20px] bg-white/[0.07] p-4">
          <p className="text-sm font-semibold">Tell your trusted contacts</p>
          {numbers.length ? (
            <>
              <a href={smsAllLink(numbers, message)} className="mt-3 block rounded-full bg-white py-3 text-center text-sm font-semibold text-[#1b0b0b]">
                Text all {numbers.length} contact{numbers.length === 1 ? "" : "s"} (SMS)
              </a>
              <div className="mt-2 flex flex-wrap gap-2">
                {profile.contacts.map((c) => (
                  <a key={c.phone} href={waLink(c.phone, message)} target="_blank" rel="noreferrer" className="rounded-full bg-[#25d366] px-3 py-1.5 text-xs font-semibold text-white">
                    WhatsApp {c.name || c.phone}
                  </a>
                ))}
              </div>
            </>
          ) : (
            <p className="mt-1 text-xs text-white/60">No trusted contacts saved. Add them under Emergency alert → Edit.</p>
          )}
          {alert.liveUrl && (
            <p className="mt-3 truncate text-xs text-white/60">
              Live location: <a href={alert.liveUrl} target="_blank" rel="noreferrer" className="text-emerald-300 underline">{alert.liveUrl.replace(/^https?:\/\//, "")}</a>
            </p>
          )}
        </div>

        <button onClick={cancel} disabled={cancelling} className="w-full rounded-full border border-white/25 py-3 text-sm font-medium text-white/90 disabled:opacity-60">
          {cancelling ? "Cancelling…" : "I'm safe now: cancel the alert"}
        </button>
        <p className="text-center text-[11px] leading-snug text-white/50">
          Prototype: this alert reaches SafeSpace&apos;s demo control rooms, not the real Delhi Police or 102. Always call 112 in real danger.
        </p>
      </div>
    </div>
  );
}
