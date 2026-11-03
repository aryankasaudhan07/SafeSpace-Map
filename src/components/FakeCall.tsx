"use client";

import { useEffect, useRef, useState } from "react";

export type CallStyle = "android" | "ios";

/** iPhone/iPad/Mac get the iOS look, everything else the Google Phone look. */
export function detectCallStyle(): CallStyle {
  if (typeof navigator === "undefined") return "android";
  return /iPhone|iPad|iPod|Macintosh/.test(navigator.userAgent) ? "ios" : "android";
}

// Masked number shown on the fake call screen, so no real-looking number is ever displayed.
const FAKE_NUMBER = "+91 98*** **210";

interface Props {
  caller: string;
  style: CallStyle;
  onEnd: () => void;
}

/** Full-screen fake incoming call, to excuse yourself from an uncomfortable situation. */
export default function FakeCall({ caller, style, onEnd }: Props) {
  const [answered, setAnswered] = useState(false);
  const seconds = useCallTimer(answered);
  useRingtone(!answered, style);
  useClock();

  // Take over the whole screen so it looks like a real call: fullscreen where supported, and no page scrolling behind it.
  useEffect(() => {
    document.documentElement.requestFullscreen?.().catch(() => {});
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prevOverflow;
      if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    };
  }, []);

  const props = { caller, answered, seconds, onAnswer: () => setAnswered(true), onEnd };
  // Phone call screens have their own fixed look in both themes.
  return <div className="keep-light">{style === "ios" ? <IosCall {...props} /> : <AndroidCall {...props} />}</div>;
}

interface ScreenProps {
  caller: string;
  answered: boolean;
  seconds: number;
  onAnswer: () => void;
  onEnd: () => void;
}

/* ───────────────────────── iPhone · iOS 26 (dark navy) ───────────────────────── */

const IOS_FONT = "-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'Helvetica Neue', system-ui, sans-serif";
// Frosted "glass" look without backdrop-filter (the background is a plain gradient, and blur renders unreliably on some phones).
const glass = "border border-white/25 bg-white/[0.16]";

function IosCall({ caller, answered, seconds, onAnswer, onEnd }: ScreenProps) {
  return (
    <div className="fixed inset-x-0 top-0 z-[3000] flex h-[100lvh] flex-col overflow-hidden text-white" style={{ fontFamily: IOS_FONT }}>
      {/* Dark navy gradient, lighter at the top like the iOS call background */}
      <div className="absolute inset-0 bg-[linear-gradient(180deg,#1f3a6e_0%,#14295a_38%,#0c1a3d_70%,#081230_100%)]" />
      <div className="absolute -right-24 top-16 h-80 w-80 rounded-full bg-[#2f5bb0]/35 blur-3xl" />
      <div className="absolute -left-24 bottom-24 h-72 w-72 rounded-full bg-[#0a1638]/70 blur-3xl" />

      <IosStatusBar />

      <div className="relative flex flex-1 flex-col items-center px-6 pt-16 text-center">
        <p className="text-[19px] font-medium text-white/55">{answered ? formatTime(seconds) : caller}</p>
        <h2 className="mt-1 text-[34px] font-bold leading-tight tracking-tight">{answered ? caller : FAKE_NUMBER}</h2>
      </div>

      {answered ? (
        <div className="relative mx-auto grid w-full max-w-[330px] grid-cols-3 gap-x-5 gap-y-6 px-6 pb-16 text-center text-[15px]">
          {[
            ["Speaker", <SpeakerIcon key="s" />],
            ["FaceTime", <FaceTimeIcon key="f" />],
            ["Mute", <MicOffIcon key="m" />],
            ["More", <MoreIcon key="o" />],
          ].map(([label, icon], i) => (
            <div key={label as string} className={`flex flex-col items-center gap-2 ${i === 3 ? "row-start-2" : ""}`}>
              <span className={`grid h-[74px] w-[74px] place-items-center rounded-full ${glass}`}>{icon}</span>
              {label}
            </div>
          ))}
          <button onClick={onEnd} className="row-start-2 flex flex-col items-center gap-2" aria-label="End call">
            <span className="grid h-[74px] w-[74px] place-items-center rounded-full border border-white/20 bg-[#e5261f]">
              <PhoneIcon down />
            </span>
            End
          </button>
          <div className="row-start-2 flex flex-col items-center gap-2">
            <span className={`grid h-[74px] w-[74px] place-items-center rounded-full ${glass}`}>
              <KeypadIcon />
            </span>
            Keypad
          </div>
        </div>
      ) : (
        <div className="relative px-8 pb-12">
          <div className="mx-auto mb-10 flex max-w-[330px] justify-between text-[15px]">
            <button onClick={onEnd} className="flex w-24 flex-col items-center gap-2">
              <span className={`grid h-[52px] w-[52px] place-items-center rounded-full ${glass}`}>
                <BubbleIcon />
              </span>
              Message
            </button>
            <button onClick={onEnd} className="flex w-24 flex-col items-center gap-2">
              <span className={`grid h-[52px] w-[52px] place-items-center rounded-full ${glass}`}>
                <VoicemailIcon />
              </span>
              Voicemail
            </button>
          </div>
          <SlideToAnswer onAnswer={onAnswer} />
        </div>
      )}

      {/* Home indicator */}
      <div className="relative mx-auto mb-2 h-[5px] w-[134px] rounded-full bg-white" />
    </div>
  );
}

/** iOS "slide to answer": drag the white knob to the right end of the glass track. */
function SlideToAnswer({ onAnswer }: { onAnswer: () => void }) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [max, setMax] = useState(240);
  useEffect(() => {
    const w = trackRef.current?.clientWidth ?? 320;
    setMax(w - 76);
  }, []);
  const { dx, dragging, handlers } = useSwipe(0, max, (d) => {
    if (d >= max * 0.85) onAnswer();
  });

  return (
    <div ref={trackRef} className={`relative mx-auto h-[78px] max-w-[330px] rounded-full ${glass}`}>
      <span
        className="ios-shimmer pointer-events-none absolute inset-0 flex items-center justify-center pl-16 text-[22px]"
        style={{ opacity: 1 - dx / (max || 1) }}
        aria-hidden
      >
        slide to answer
      </span>
      <div
        role="slider"
        aria-label="Slide to answer"
        aria-valuemin={0}
        aria-valuemax={max}
        aria-valuenow={Math.round(dx)}
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "ArrowRight" || e.key === "Enter") onAnswer();
        }}
        {...handlers}
        className="absolute left-[6px] top-[6px] grid h-[66px] w-[66px] cursor-grab touch-none place-items-center rounded-full bg-white text-[#34c759] shadow-md active:cursor-grabbing"
        style={{ transform: `translateX(${dx}px)`, transition: dragging ? "none" : "transform .3s ease" }}
      >
        <PhoneIcon large />
      </div>
    </div>
  );
}

function IosStatusBar() {
  return (
    <div className="relative flex h-[54px] items-center justify-between px-8 text-[16px] font-semibold">
      <span className="flex w-16 items-center gap-1">
        {statusTime(true)}
        <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="currentColor" aria-hidden>
          <path d="M21 3 3 10.5l7.5 2.8L13.3 21 21 3Z" />
        </svg>
      </span>
      {/* Dynamic Island */}
      <span className="absolute left-1/2 top-[11px] h-[34px] w-[124px] -translate-x-1/2 rounded-full bg-black" aria-hidden>
        <span className="absolute right-4 top-1/2 h-1.5 w-1.5 -translate-y-1/2 rounded-full bg-[#ff9f0a]" />
      </span>
      <span className="flex w-16 items-center justify-end gap-1.5" aria-hidden>
        <SignalBars />
        <svg viewBox="0 0 16 12" className="h-3 w-4" fill="currentColor">
          <path d="M8 2.2c2.3 0 4.4.9 6 2.4l1.2-1.3A10.4 10.4 0 0 0 8 .4 10.4 10.4 0 0 0 .8 3.3L2 4.6a8.6 8.6 0 0 1 6-2.4Zm0 3.6c1.3 0 2.5.5 3.4 1.3l1.2-1.3A6.6 6.6 0 0 0 8 4a6.6 6.6 0 0 0-4.6 1.8l1.2 1.3A4.9 4.9 0 0 1 8 5.8Zm0 3.5a1.4 1.4 0 0 0-1 .4L8 11.5l1-1.8a1.4 1.4 0 0 0-1-.4Z" />
        </svg>
        <svg viewBox="0 0 27 13" className="h-3 w-[25px]" fill="none">
          <rect x="0.5" y="0.5" width="23" height="12" rx="3.8" stroke="currentColor" opacity="0.45" />
          <path d="M25 4.5v4c.8-.3 1.5-1.1 1.5-2s-.7-1.7-1.5-2Z" fill="currentColor" opacity="0.45" />
        </svg>
      </span>
    </div>
  );
}

/* ───────────────────────── Android · Google Phone (Pixel, dark) ───────────────────────── */

const A = {
  bg: "#2b1f1c",
  surface: "#43312d",
  sheet: "#3a2a27",
  text: "#f5ddd8",
  muted: "#d8c2bd",
  accent: "#ffb4a6",
  blue: "#8ab4f8",
  end: "#ee675c",
};

function AndroidCall({ caller, answered, seconds, onAnswer, onEnd }: ScreenProps) {
  return (
    <div
      className="fixed inset-x-0 top-0 z-[3000] flex h-[100lvh] flex-col"
      style={{ background: A.bg, color: A.text, fontFamily: "'Google Sans', Roboto, system-ui, sans-serif" }}
    >
      <AndroidStatusBar />

      <div className="flex flex-1 flex-col items-center px-6 pt-8 text-center">
        <p className="flex items-center gap-2 text-[17px]" style={{ color: A.muted }}>
          {answered ? (
            <>
              <span className="rounded-[4px] border-2 px-1 text-[10px] font-bold leading-[14px]" style={{ borderColor: A.muted }}>
                HD
              </span>
              <WifiCallIcon />
              {formatTime(seconds)}
            </>
          ) : (
            <>
              <WifiCallIcon />
              <span>
                <span style={{ color: A.blue }}>Jio 4G</span> Wi‑Fi call from
              </span>
            </>
          )}
        </p>
        <h2 className="mt-4 text-[44px] font-normal leading-tight">{caller}</h2>
        {answered ? (
          <p className="mt-1 text-[17px]" style={{ color: A.blue }}>
            Wi‑Fi call
          </p>
        ) : (
          <p className="mt-1 text-[17px]" style={{ color: A.muted }}>
            Mobile {FAKE_NUMBER}
          </p>
        )}
        <div className="mt-10 grid h-[116px] w-[116px] place-items-center rounded-full text-5xl font-medium" style={{ background: "#ffdad3", color: "#3b0905" }}>
          {initial(caller)}
        </div>
      </div>

      {answered ? (
        <div className="rounded-t-[28px] px-4 pb-4 pt-6" style={{ background: A.sheet }}>
          <div className="mx-auto flex max-w-sm justify-between text-center text-[14px]" style={{ color: A.text }}>
            {[
              ["Keypad", <KeypadIcon key="k" />, false],
              ["Mute", <MicIcon key="m" />, false],
              ["Speaker", <SpeakerIcon key="s" />, true],
              ["More", <MoreVerticalIcon key="o" />, false],
            ].map(([label, icon, active]) => (
              <div key={label as string} className="flex w-[84px] flex-col items-center gap-2">
                <span
                  className={`grid h-[76px] w-[76px] place-items-center ${active ? "rounded-[22px]" : "rounded-full"}`}
                  style={active ? { background: "#ffdbd1", color: "#3b0905" } : { background: A.bg, color: A.text }}
                >
                  {icon}
                </span>
                {label}
              </div>
            ))}
          </div>
          <button
            onClick={onEnd}
            className="mx-auto mt-5 flex h-[76px] w-[220px] items-center justify-center rounded-full"
            style={{ background: A.end, color: "#3b0905" }}
            aria-label="End call"
          >
            <PhoneIcon down large />
          </button>
          <AndroidNavBar />
        </div>
      ) : (
        <div className="px-6 pb-4">
          <div className="mb-10 flex justify-center">
            <button onClick={onEnd} className="flex items-center gap-2.5 rounded-full px-7 py-4 text-[17px]" style={{ background: A.surface }}>
              <span style={{ color: A.accent }}>
                <BubbleOutlineIcon />
              </span>
              Message
            </button>
          </div>
          <AndroidSwipe onAnswer={onAnswer} onDecline={onEnd} />
          <div className="mt-16">
            <AndroidNavBar />
          </div>
        </div>
      )}
    </div>
  );
}

/** Pixel incoming-call pill: drag the white handle left to decline, right to answer (labels tap too). */
function AndroidSwipe({ onAnswer, onDecline }: { onAnswer: () => void; onDecline: () => void }) {
  const LIMIT = 92;
  const MIN = -LIMIT;
  const { dx, dragging, handlers } = useSwipe(MIN, LIMIT, (d) => {
    if (d >= LIMIT * 0.8) onAnswer();
    else if (d <= -LIMIT * 0.8) onDecline();
  });
  const towardAnswer = dx > 25;
  const towardDecline = dx < -25;

  return (
    <div className="relative mx-auto flex h-[112px] max-w-[420px] items-center justify-between rounded-full px-6 text-[18px]" style={{ background: A.surface }}>
      <button onClick={onDecline} className="relative z-10" style={{ opacity: towardAnswer ? 0.4 : 1 }}>
        Decline
      </button>
      <button onClick={onAnswer} className="relative z-10" style={{ opacity: towardDecline ? 0.4 : 1 }}>
        Answer
      </button>
      <div
        role="slider"
        aria-label="Swipe right to answer, left to decline"
        aria-valuemin={MIN}
        aria-valuemax={LIMIT}
        aria-valuenow={Math.round(dx)}
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "ArrowRight" || e.key === "Enter") onAnswer();
          if (e.key === "ArrowLeft") onDecline();
        }}
        {...handlers}
        className="absolute left-1/2 top-1/2 z-20 grid h-[88px] w-[112px] cursor-grab touch-none place-items-center rounded-full shadow-md active:cursor-grabbing"
        style={{
          transform: `translate(calc(-50% + ${dx}px), -50%)`,
          transition: dragging ? "background-color .2s" : "transform .25s ease, background-color .2s",
          background: towardDecline ? A.end : "#ffffff",
          color: towardDecline ? "#fff" : "#1e8e3e",
        }}
      >
        <span className={!dragging && dx === 0 ? "animate-[nudge_1.6s_ease-in-out_infinite]" : ""} style={towardDecline ? { transform: "rotate(135deg)" } : undefined}>
          <PhoneIcon large />
        </span>
      </div>
    </div>
  );
}

function AndroidStatusBar() {
  return (
    <div className="flex items-center justify-between px-6 pt-3 text-[15px] font-medium" style={{ color: A.text }}>
      <span>{statusTime(true)}</span>
      <span className="flex items-center gap-1.5" aria-hidden>
        <svg viewBox="0 0 16 12" className="h-3 w-4" fill="currentColor">
          <path d="M8 2.2c2.3 0 4.4.9 6 2.4l1.2-1.3A10.4 10.4 0 0 0 8 .4 10.4 10.4 0 0 0 .8 3.3L2 4.6a8.6 8.6 0 0 1 6-2.4Zm0 3.6c1.3 0 2.5.5 3.4 1.3l1.2-1.3A6.6 6.6 0 0 0 8 4a6.6 6.6 0 0 0-4.6 1.8l1.2 1.3A4.9 4.9 0 0 1 8 5.8Zm0 3.5a1.4 1.4 0 0 0-1 .4L8 11.5l1-1.8a1.4 1.4 0 0 0-1-.4Z" />
        </svg>
        <SignalBars />
        <span>76%</span>
      </span>
    </div>
  );
}

function AndroidNavBar() {
  return (
    <div className="mt-4 flex items-center justify-around px-10 text-[#cdb8b3]" aria-hidden>
      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
        <path d="M5 7h14M5 12h14M5 17h14" />
      </svg>
      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
        <rect x="6" y="6" width="12" height="12" rx="3" />
      </svg>
      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round">
        <path d="M17 5v14L6 12l11-7Z" />
      </svg>
    </div>
  );
}

/* ───────────────────────── shared bits ───────────────────────── */

/** Horizontal drag between `min` and `max`; `onRelease` gets the final offset, then the handle springs back. */
function useSwipe(min: number, max: number, onRelease: (dx: number) => void) {
  const [dx, setDx] = useState(0);
  const [dragging, setDragging] = useState(false);
  const start = useRef<number | null>(null);
  const handlers = {
    onPointerDown(e: React.PointerEvent) {
      start.current = e.clientX;
      setDragging(true);
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    },
    onPointerMove(e: React.PointerEvent) {
      if (start.current === null) return;
      setDx(Math.max(min, Math.min(max, e.clientX - start.current)));
    },
    onPointerUp() {
      if (start.current === null) return;
      onRelease(dx);
      start.current = null;
      setDragging(false);
      setDx(0);
    },
  };
  return { dx, dragging, handlers: { ...handlers, onPointerCancel: handlers.onPointerUp } };
}

function useCallTimer(running: boolean) {
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(id);
  }, [running]);
  return seconds;
}

/** Re-render every 30s so the status-bar clock stays current. */
function useClock() {
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 30_000);
    return () => clearInterval(id);
  }, []);
}

/** Synthesised ringtone (no audio files): marimba-like arpeggio for iOS, two-tone ring for Android. */
// Audio unlocked during the user's tap, for calls that ring after a delay (iOS only allows sound started from a tap).
let primedCtx: AudioContext | null = null;

/** Call from the tap that schedules a delayed fake call, so the ringtone can play later. */
export function primeRingtone() {
  try {
    primedCtx ??= new AudioContext();
    primedCtx.resume().catch(() => {});
    // A silent blip inside the gesture fully unlocks audio on iOS Safari.
    const osc = primedCtx.createOscillator();
    const gain = primedCtx.createGain();
    gain.gain.value = 0;
    osc.connect(gain).connect(primedCtx.destination);
    osc.start();
    osc.stop(primedCtx.currentTime + 0.01);
  } catch {
    // no Web Audio: the call still shows, just silently
  }
}

function useRingtone(ringing: boolean, style: CallStyle) {
  useEffect(() => {
    if (!ringing) return;
    const ctx = primedCtx ?? new AudioContext();
    primedCtx = null;
    ctx.resume().catch(() => {});
    let stopped = false;
    const notes: [number, number][] =
      style === "ios"
        ? [[1046, 0], [1318, 0.12], [1568, 0.24], [1318, 0.36], [1046, 0.6], [1318, 0.72], [1568, 0.84], [1318, 0.96]]
        : [[784, 0], [988, 0.18], [784, 0.5], [988, 0.68]];
    const ring = () => {
      if (stopped) return;
      for (const [freq, at] of notes) {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = style === "ios" ? "triangle" : "sine";
        osc.frequency.value = freq;
        const t = ctx.currentTime + at;
        gain.gain.setValueAtTime(0.0001, t);
        gain.gain.exponentialRampToValueAtTime(0.2, t + 0.01);
        gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
        osc.connect(gain).connect(ctx.destination);
        osc.start(t);
        osc.stop(t + 0.2);
      }
      navigator.vibrate?.([500, 300, 500]);
    };
    ring();
    const id = setInterval(ring, 2200);
    return () => {
      stopped = true;
      clearInterval(id);
      navigator.vibrate?.(0);
      ctx.close();
    };
  }, [ringing, style]);
}

const statusTime = (h12: boolean) =>
  new Date().toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", hour12: h12 }).replace(/\s?[ap]m/i, "");
const initial = (name: string) => name.trim()[0]?.toUpperCase() ?? "?";
const formatTime = (s: number) => `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;

/* ───────────────────────── icons ───────────────────────── */

function PhoneIcon({ down, large }: { down?: boolean; large?: boolean }) {
  return (
    <svg viewBox="0 0 24 24" className={large ? "h-9 w-9" : "h-8 w-8"} fill="currentColor" style={down ? { transform: "rotate(135deg)" } : undefined} aria-hidden>
      <path d="M6.6 10.8a15.1 15.1 0 0 0 6.6 6.6l2.2-2.2a1 1 0 0 1 1-.25 11.4 11.4 0 0 0 3.6.57 1 1 0 0 1 1 1V20a1 1 0 0 1-1 1A17 17 0 0 1 3 4a1 1 0 0 1 1-1h3.5a1 1 0 0 1 1 1c0 1.25.2 2.45.57 3.57a1 1 0 0 1-.25 1L6.6 10.8Z" />
    </svg>
  );
}
function SignalBars() {
  return (
    <svg viewBox="0 0 18 12" className="h-3 w-[18px]" fill="currentColor" aria-hidden>
      <rect x="0" y="8" width="3" height="4" rx="0.8" />
      <rect x="5" y="5.5" width="3" height="6.5" rx="0.8" />
      <rect x="10" y="3" width="3" height="9" rx="0.8" />
      <rect x="15" y="0" width="3" height="12" rx="0.8" />
    </svg>
  );
}
const Filled = ({ children, size = "h-7 w-7" }: { children: React.ReactNode; size?: string }) => (
  <svg viewBox="0 0 24 24" className={size} fill="currentColor" aria-hidden>
    {children}
  </svg>
);
const BubbleIcon = () => (
  <Filled size="h-6 w-6">
    <path d="M12 3.5c5 0 9 3.3 9 7.4s-4 7.4-9 7.4c-.9 0-1.8-.1-2.6-.3L5 20l1.1-3.5C4.2 15.2 3 13.2 3 10.9c0-4.1 4-7.4 9-7.4Z" />
  </Filled>
);
const BubbleOutlineIcon = () => (
  <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" aria-hidden>
    <path d="M4 5h16v11H8l-4 3.5V5Z" />
  </svg>
);
const VoicemailIcon = () => (
  <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden>
    <circle cx="6.5" cy="12" r="3.8" />
    <circle cx="17.5" cy="12" r="3.8" />
    <path d="M6.5 15.8h11" />
  </svg>
);
const SpeakerIcon = () => (
  <Filled>
    <path d="M3 9.5h4L12 5v14l-5-4.5H3v-5Z" />
    <path d="M15 8.5a5 5 0 0 1 0 7M17.8 6a8.5 8.5 0 0 1 0 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
  </Filled>
);
const FaceTimeIcon = () => (
  <Filled>
    <path d="M3 7.5A2.5 2.5 0 0 1 5.5 5h8A2.5 2.5 0 0 1 16 7.5v9a2.5 2.5 0 0 1-2.5 2.5h-8A2.5 2.5 0 0 1 3 16.5v-9Zm14 3 4-3v9l-4-3v-3Z" />
  </Filled>
);
const MicIcon = () => (
  <Filled>
    <path d="M12 2.5a3.5 3.5 0 0 1 3.5 3.5v5a3.5 3.5 0 0 1-7 0V6A3.5 3.5 0 0 1 12 2.5Z" />
    <path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21M8.5 21h7" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
  </Filled>
);
const MicOffIcon = () => (
  <Filled>
    <path d="M12 2.5a3.5 3.5 0 0 1 3.5 3.5v5a3.5 3.5 0 0 1-7 0V6A3.5 3.5 0 0 1 12 2.5Z" />
    <path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21M8.5 21h7M3.5 3.5l17 17" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
  </Filled>
);
const KeypadIcon = () => (
  <Filled>
    {[5, 12, 19].flatMap((y) => [5, 12, 19].map((x) => <circle key={`${x}-${y}`} cx={x} cy={y} r="2.1" />))}
  </Filled>
);
const MoreIcon = () => (
  <Filled>
    <circle cx="5" cy="12" r="2" />
    <circle cx="12" cy="12" r="2" />
    <circle cx="19" cy="12" r="2" />
  </Filled>
);
const MoreVerticalIcon = () => (
  <Filled>
    <circle cx="12" cy="5" r="2" />
    <circle cx="12" cy="12" r="2" />
    <circle cx="12" cy="19" r="2" />
  </Filled>
);
const WifiCallIcon = () => (
  <svg viewBox="0 0 24 20" className="h-4 w-5" fill="currentColor" aria-hidden>
    <path d="M12 19 1 5.5C4 3 7.9 1.5 12 1.5S20 3 23 5.5L12 19Z" opacity="0.85" />
  </svg>
);
