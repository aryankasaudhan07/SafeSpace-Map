import type { Metadata } from "next";
import Link from "next/link";
import QRCode from "qrcode";
import Logo from "@/components/Logo";
import ThemeToggle from "@/components/ThemeToggle";
import { INVITE_MESSAGE, REPORT_URL, SITE_URL } from "@/lib/invite";
import InviteActions from "./InviteActions";

export const metadata: Metadata = {
  title: "Invite · SafeSpace Map",
  description: "Felt unsafe somewhere in Delhi? Pin it anonymously on SafeSpace Map and warn the next woman.",
};

const STEPS = [
  ["Scan the code", "Opens SafeSpace Map. No app, no login."],
  ["Tap the spot", "Where you felt unsafe: a street, bus stop, metro exit."],
  ["Say what happened", "In English, Hindi or Hinglish. AI removes names and numbers."],
];

/** Printable poster + WhatsApp message, to collect real reports. */
export default async function InvitePage() {
  const qr = await QRCode.toString(REPORT_URL, { type: "svg", margin: 0, color: { dark: "#111111", light: "#ffffff" } });

  return (
    <div className="min-h-dvh bg-canvas px-4 py-6 text-slate-900 print:bg-white print:p-0">
      <div className="mx-auto max-w-3xl space-y-6">
        <div className="flex items-center justify-between print:hidden">
          <Link href="/" className="flex items-center gap-2.5">
            <Logo />
            <span className="text-[17px] tracking-tight">
              SafeSpace <span className="font-bold">Map</span>
            </span>
          </Link>
          <div className="flex items-center gap-3">
            <ThemeToggle />
            <Link href="/" className="text-sm text-slate-500 hover:underline">
              Back to map
            </Link>
          </div>
        </div>

        <div className="print:hidden">
          <h1 className="text-2xl font-semibold tracking-tight">Invite women to add real reports</h1>
          <p className="text-sm text-slate-500">Send the message to your WhatsApp groups, or print the poster for notice boards.</p>
        </div>

        <InviteActions message={INVITE_MESSAGE} />

        {/* Poster */}
        <section className="poster keep-light mx-auto flex aspect-[1/1.414] w-full max-w-[640px] flex-col rounded-[32px] bg-white p-8 shadow-[0_40px_90px_-40px_rgba(15,23,42,0.35)] sm:p-12 print:max-w-none print:rounded-none print:shadow-none">
          <div className="flex items-center gap-2.5">
            <Logo />
            <span className="text-lg tracking-tight">
              SafeSpace <span className="font-bold">Map</span>
            </span>
          </div>

          <h2 className="mt-8 text-[clamp(28px,6vw,44px)] font-semibold leading-[1.05] tracking-tight">
            Felt unsafe somewhere in Delhi?
            <br />
            <span className="text-brand">Warn the next woman.</span>
          </h2>
          <p className="mt-4 max-w-md text-[15px] leading-relaxed text-slate-600">
            Pin it anonymously. Your report shows other women where to take care, and helps pick safer walking routes.
          </p>

          <div className="mt-8 flex flex-1 flex-col gap-8 sm:flex-row sm:items-center">
            <div className="mx-auto w-[min(56vw,220px)] shrink-0 rounded-3xl border-[10px] border-[#f3f0fe] bg-white p-3 sm:mx-0" aria-label={`QR code for ${REPORT_URL}`}>
              <div className="[&>svg]:h-auto [&>svg]:w-full" dangerouslySetInnerHTML={{ __html: qr }} />
            </div>
            <ol className="space-y-4">
              {STEPS.map(([title, text], i) => (
                <li key={title} className="flex gap-3">
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-[#111] text-sm font-semibold text-white">{i + 1}</span>
                  <div>
                    <p className="font-semibold">{title}</p>
                    <p className="text-sm text-slate-600">{text}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>

          <div className="mt-8 flex flex-wrap gap-2 text-xs">
            {["Anonymous", "No login", "Names & numbers removed by AI", "Checked by the community"].map((t) => (
              <span key={t} className="rounded-full bg-soft px-3 py-1.5 font-medium text-slate-700">
                {t}
              </span>
            ))}
          </div>

          <div className="mt-6 flex flex-wrap items-end justify-between gap-3 border-t border-slate-100 pt-5">
            <p className="text-sm font-semibold">{SITE_URL.replace("https://", "")}</p>
            <p className="text-xs text-red-700">
              In danger? Call <strong>112</strong> · Women helpline <strong>1091</strong> / <strong>181</strong>
            </p>
          </div>
        </section>
      </div>
    </div>
  );
}
