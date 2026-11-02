"use client";

import { useEffect, useState } from "react";
import { IconBadge } from "./Icon";
import { copyText, googleMapsOpenLink, liveMessage, locationMessage, nativeShare, shareTargets } from "@/lib/share";
import type { LatLng } from "@/lib/types";

interface Props {
  point: LatLng;
  /** Share a live-tracking link instead of a one-off Google Maps pin */
  live?: { url: string; expiresAt: string };
  onClose: () => void;
}

/** Bottom sheet with every way to send your location, like the phone's share menu. */
export default function ShareSheet({ point, live, onClose }: Props) {
  const msg = live ? liveMessage(live.url, live.expiresAt) : locationMessage(point);
  const targets = shareTargets(msg);
  const [copied, setCopied] = useState(false);
  const [copyFailed, setCopyFailed] = useState(false);
  const [canNative, setCanNative] = useState(false);

  useEffect(() => {
    setCanNative(typeof navigator !== "undefined" && !!navigator.share);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function copy() {
    if (await copyText(`${msg.text} ${msg.url}`)) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } else {
      // Browser blocked the clipboard: show the link so it can be copied by hand.
      setCopyFailed(true);
    }
  }

  const apps: { label: string; color: string; href?: string; onClick?: () => void; glyph: React.ReactNode }[] = [
    ...(canNative
      ? [{ label: "More apps", color: "#111", onClick: () => nativeShare(msg), glyph: <ShareGlyph /> }]
      : []),
    { label: "WhatsApp", color: "#25d366", href: targets.whatsapp, glyph: <ChatGlyph /> },
    { label: "Messages", color: "#34c759", href: targets.sms, glyph: <SmsGlyph /> },
    { label: "Telegram", color: "#229ed9", href: targets.telegram, glyph: <PlaneGlyph /> },
    { label: "Email", color: "#ea4335", href: targets.email, glyph: <MailGlyph /> },
    { label: copied ? "Copied!" : "Copy link", color: "#5b2be0", onClick: copy, glyph: <CopyGlyph /> },
  ];

  return (
    <div className="fixed inset-0 z-[2500] flex items-end justify-center bg-black/40 sm:items-center" onClick={onClose} role="dialog" aria-modal="true" aria-label="Share your location">
      <div className="w-full max-w-md rounded-t-[28px] bg-white p-5 pb-7 shadow-2xl sm:rounded-[28px]" onClick={(e) => e.stopPropagation()}>
        <div className="mx-auto mb-4 h-1.5 w-10 rounded-full bg-slate-200 sm:hidden" />
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-lg font-semibold">{live ? "Share your live location" : "Share your location"}</h3>
            <p className="text-xs text-slate-500">
              {live ? "Anyone with the link can follow you on a map until you stop." : "Sends a Google Maps link with a pin on where you are."}
            </p>
          </div>
          <button onClick={onClose} className="rounded-full bg-soft px-3 py-1 text-xs text-slate-600" aria-label="Close">
            Close
          </button>
        </div>

        {/* Link preview */}
        <a href={msg.url} target="_blank" rel="noreferrer" className="mt-4 flex items-center gap-3 rounded-2xl bg-soft p-3 hover:bg-slate-100">
          <IconBadge name="pin" color={live ? "#059669" : "#ea4335"} size={40} />
          <div className="min-w-0">
            <p className="text-sm font-medium">{live ? "SafeSpace Map · live location" : "Google Maps · my location"}</p>
            <p className="truncate text-xs text-slate-500">{msg.url.replace("https://", "")}</p>
            <p className="text-[11px] text-slate-400">
              {point.lat.toFixed(5)}, {point.lng.toFixed(5)}
            </p>
          </div>
        </a>

        {/* Share targets */}
        <div className="mt-5 grid grid-cols-4 gap-y-4 sm:grid-cols-6">
          {apps.map((a) => {
            const inner = (
              <>
                <span className="grid h-12 w-12 place-items-center rounded-full text-white" style={{ background: a.color }}>
                  {a.glyph}
                </span>
                <span className="text-[11px] text-slate-700">{a.label}</span>
              </>
            );
            return a.href ? (
              <a key={a.label} href={a.href} target="_blank" rel="noreferrer" className="flex flex-col items-center gap-1.5">
                {inner}
              </a>
            ) : (
              <button key={a.label} onClick={a.onClick} className="flex flex-col items-center gap-1.5">
                {inner}
              </button>
            );
          })}
        </div>

        {copyFailed && (
          <div className="mt-4">
            <p className="mb-1 text-[11px] text-slate-500">Couldn&apos;t copy automatically. Press and hold the link to copy it:</p>
            <input
              readOnly
              value={msg.url}
              onFocus={(e) => e.currentTarget.select()}
              autoFocus
              aria-label="Location link"
              className="w-full rounded-full bg-soft px-4 py-2.5 text-xs outline-none ring-brand/30 focus:ring-2"
            />
          </div>
        )}

        {live ? (
          <p className="mt-5 text-center text-[11px] text-slate-500">
            Your position updates every few seconds. Keep SafeSpace Map open; stop sharing any time from Help now.
          </p>
        ) : (
          <>
            <a
              href={googleMapsOpenLink(point)}
              target="_blank"
              rel="noreferrer"
              className="mt-5 flex w-full items-center justify-center gap-2 rounded-full bg-[#111] py-3 text-sm font-medium text-white"
            >
              Open in Google Maps
            </a>
            <p className="mt-2 text-center text-[11px] text-slate-500">
              For <strong>live</strong> tracking, use <em>Share live location</em> in Help now.
            </p>
          </>
        )}
      </div>
    </div>
  );
}

const G = ({ children }: { children: React.ReactNode }) => (
  <svg viewBox="0 0 24 24" className="h-6 w-6" fill="currentColor" aria-hidden>
    {children}
  </svg>
);
const ShareGlyph = () => (
  <G>
    <circle cx="18" cy="5" r="3" />
    <circle cx="6" cy="12" r="3" />
    <circle cx="18" cy="19" r="3" />
    <path d="m8.6 10.6 6.8-4M8.6 13.4l6.8 4" stroke="currentColor" strokeWidth="2" />
  </G>
);
const ChatGlyph = () => (
  <G>
    <path d="M12 2.5a9.5 9.5 0 0 0-8.2 14.3L2.5 21.5l4.8-1.3A9.5 9.5 0 1 0 12 2.5Zm4.6 13.2c-.2.6-1.2 1.2-1.7 1.2-.4.1-1 .1-1.6-.1-.4-.1-.9-.3-1.5-.6-2.6-1.1-4.3-3.8-4.4-4-.1-.2-1-1.4-1-2.7s.7-1.9.9-2.2c.2-.3.5-.3.7-.3h.5c.2 0 .4 0 .6.5l.8 2c.1.2.1.3 0 .5l-.3.5-.4.4c-.1.1-.3.3-.1.5.1.3.7 1.1 1.4 1.8.9.8 1.7 1.1 2 1.2.2.1.4.1.5-.1l.7-.9c.2-.2.3-.2.6-.1l1.9.9c.2.1.4.2.4.3.1.1.1.6-.1 1.2Z" />
  </G>
);
const SmsGlyph = () => (
  <G>
    <path d="M12 3.5c5 0 9 3.3 9 7.4s-4 7.4-9 7.4c-.9 0-1.8-.1-2.6-.3L5 20l1.1-3.5C4.2 15.2 3 13.2 3 10.9c0-4.1 4-7.4 9-7.4Z" />
  </G>
);
const PlaneGlyph = () => (
  <G>
    <path d="M21.5 3.5 2.8 10.7c-.9.4-.9 1.6 0 1.9l4.6 1.5 1.7 5.4c.2.7 1.1.9 1.6.4l2.6-2.4 4.7 3.5c.6.4 1.4.1 1.6-.6L22.9 5c.2-.9-.6-1.8-1.4-1.5Zm-4 4.2-7.6 6.9-.3 3-1.2-3.9 9.1-6Z" />
  </G>
);
const MailGlyph = () => (
  <G>
    <path d="M3 6.5A1.5 1.5 0 0 1 4.5 5h15A1.5 1.5 0 0 1 21 6.5v11a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 17.5v-11Zm2 .9v.3l7 4.6 7-4.6v-.3H5Z" />
  </G>
);
const CopyGlyph = () => (
  <G>
    <path d="M9 3h9.5A2.5 2.5 0 0 1 21 5.5V15a2 2 0 0 1-2 2h-1V7.5A2.5 2.5 0 0 0 15.5 5H7a2 2 0 0 1 2-2Z" />
    <rect x="3" y="7" width="13" height="14" rx="2.5" />
  </G>
);
