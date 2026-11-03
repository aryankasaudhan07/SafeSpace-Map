import type { Metadata } from "next";
import Link from "next/link";
import { IconBadge } from "@/components/Icon";
import Logo from "@/components/Logo";
import { SERVICES, SERVICE_KEYS } from "@/lib/emergency-shared";

export const metadata: Metadata = {
  title: "Control room (demo) · SafeSpace Map",
  robots: { index: false, follow: false },
};

const DESC = {
  police: "Receives SOS alerts with live location, caller number and the nearest police station. Acknowledge, dispatch a unit, call back.",
  ambulance: "Receives SOS alerts with live location, caller number and the nearest hospital. Acknowledge, dispatch an ambulance, call back.",
} as const;

/** Entry to the demo control rooms: pick a desk; one passcode opens both. */
export default function ControlHome() {
  return (
    <div className="min-h-dvh bg-canvas px-4 py-6 text-slate-900 sm:py-12">
      <div className="mx-auto max-w-3xl space-y-6">
        <div className="flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2.5">
            <Logo />
            <span className="text-[17px] tracking-tight">
              SafeSpace <span className="font-bold">Map</span>
            </span>
          </Link>
          <Link href="/" className="text-sm text-slate-500 hover:underline">
            Back to map
          </Link>
        </div>

        <div>
          <h1 className="text-3xl font-semibold tracking-tight">SafeSpace Response · Control room</h1>
          <p className="mt-1 text-sm text-slate-500">
            For staff. Choose your desk and enter the desk passcode. The same passcode opens both desks, and you can switch between them at the top.
          </p>
          <p className="mt-3 inline-block rounded-full bg-amber-100 px-3 py-1.5 text-xs font-semibold text-amber-900">
            DEMO: not connected to the real Delhi Police (112) or 102
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          {SERVICE_KEYS.map((s) => (
            <Link
              key={s}
              href={`/control/${s}`}
              className="group rounded-[28px] bg-white p-6 shadow-[0_24px_60px_-30px_rgba(15,23,42,0.35)] ring-1 ring-slate-100 transition hover:-translate-y-0.5 hover:ring-slate-300"
            >
              <IconBadge name={s === "police" ? "police" : "hospital"} color={SERVICES[s].color} size={48} />
              <p className="mt-4 text-xl font-semibold">{SERVICES[s].desk}</p>
              <p className="mt-1 text-sm text-slate-600">{DESC[s]}</p>
              <p className="mt-4 text-sm font-semibold" style={{ color: SERVICES[s].color }}>
                Open {SERVICES[s].desk.toLowerCase()} →
              </p>
            </Link>
          ))}
        </div>

        <div className="rounded-[22px] bg-white p-5 text-sm text-slate-600 ring-1 ring-slate-100">
          <p className="font-semibold text-slate-900">How a demo runs</p>
          <ol className="mt-2 list-decimal space-y-1 pl-5">
            <li>Open a desk here on a laptop and enter the passcode.</li>
            <li>On a phone, open safespacemap.vercel.app and hold the red SOS button for 5 seconds.</li>
            <li>The desk sounds an alarm and shows the caller on the map; acknowledge, call back and dispatch.</li>
          </ol>
        </div>
      </div>
    </div>
  );
}
