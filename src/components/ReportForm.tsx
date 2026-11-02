"use client";

import { useState } from "react";
import { CATEGORIES, TIMES, TIME_KEYS, type LatLng, type Report, type TimeOfDay } from "@/lib/types";

interface Props {
  picked: LatLng | null;
  onPick: (p: LatLng) => void;
  onSubmitted: (r: Report) => void;
  onClose: () => void;
}

function currentTimeOfDay(): TimeOfDay {
  const h = new Date().getHours();
  if (h >= 6 && h < 12) return "morning";
  if (h >= 12 && h < 17) return "afternoon";
  if (h >= 17 && h < 21) return "evening";
  return "night";
}

export default function ReportForm({ picked, onPick, onSubmitted, onClose }: Props) {
  const [description, setDescription] = useState("");
  const [timeOfDay, setTimeOfDay] = useState<TimeOfDay>(currentTimeOfDay);
  const [status, setStatus] = useState<"idle" | "locating" | "sending">("idle");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Report | null>(null);

  function useMyLocation() {
    if (!navigator.geolocation) return setError("Location is not available in this browser.");
    setStatus("locating");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        onPick({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setStatus("idle");
      },
      () => {
        setError("Couldn't get your location. Tap the map instead.");
        setStatus("idle");
      },
      { enableHighAccuracy: true, timeout: 10000 },
    );
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!picked) return setError("Tap the map (or use your location) to mark where it happened.");
    setError(null);
    setStatus("sending");
    try {
      const res = await fetch("/api/reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...picked, description, timeOfDay }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Something went wrong.");
      setResult(data.report);
      onSubmitted(data.report);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setStatus("idle");
    }
  }

  if (result) {
    const cat = CATEGORIES[result.category];
    return (
      <div className="space-y-4">
        <div className="rounded-[22px] bg-emerald-50 p-5">
          <p className="font-semibold text-emerald-800">Thank you. Your report is on the map.</p>
          <p className="mt-1 text-sm text-emerald-700">
            It&apos;s anonymous, and personal details have been removed. It shows as <strong>Unverified</strong> until other women confirm it.
          </p>
        </div>
        <div className="rounded-[22px] bg-soft p-5">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">AI triage</p>
          <p className="mt-1 font-semibold">{result.title}</p>
          <div className="mt-2 flex flex-wrap gap-2 text-xs">
            <span className="rounded-full px-2 py-0.5 text-white" style={{ background: cat.color }}>
              {cat.short}
            </span>
            <span className="rounded-full bg-slate-100 px-2 py-0.5">Severity {result.severity}/5</span>
          </div>
          <p className="mt-2 text-sm text-slate-600">{result.description}</p>
        </div>
        <button onClick={onClose} className="w-full rounded-full bg-[#111] py-3 text-sm font-medium text-white">
          Back to map
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight">Report an unsafe spot</h2>
        <p className="text-sm text-slate-500">Anonymous. No login, no names stored.</p>
        <p className="mt-1 text-xs text-slate-500">
          Describe the place and what happened. Don&apos;t name people or businesses: reports that accuse someone are rejected.
        </p>
      </div>

      <div className="rounded-[22px] bg-soft p-4 text-sm">
        <p className="font-medium text-slate-900">1. Where did it happen?</p>
        <p className="mt-0.5 text-slate-500">
          {picked ? `Pinned at ${picked.lat.toFixed(4)}, ${picked.lng.toFixed(4)}. Tap the map to move it.` : "Tap the map to drop a pin."}
        </p>
        <button
          type="button"
          onClick={useMyLocation}
          className="mt-3 rounded-full bg-[#111] px-4 py-2 text-xs font-medium text-white hover:bg-black"
        >
          {status === "locating" ? "Locating…" : "Use my current location"}
        </button>
      </div>

      <label className="block text-sm">
        <span className="font-medium">2. What happened?</span>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={4}
          maxLength={1000}
          required
          placeholder="e.g. A man followed me from the metro exit to the bus stop. The road is dark after 8pm. (English, Hindi or Hinglish)"
          className="mt-1.5 w-full rounded-[20px] bg-soft p-3.5 text-sm outline-none ring-brand/30 focus:ring-2"
        />
      </label>

      <label className="block text-sm">
        <span className="font-medium">3. When?</span>
        <select
          value={timeOfDay}
          onChange={(e) => setTimeOfDay(e.target.value as TimeOfDay)}
          className="mt-1.5 w-full rounded-full bg-soft px-4 py-3 text-sm outline-none"
        >
          {TIME_KEYS.map((t) => (
            <option key={t} value={t}>
              {TIMES[t]}
            </option>
          ))}
        </select>
      </label>

      {error && <p className="rounded-lg bg-red-50 p-2.5 text-sm text-red-700">{error}</p>}

      <div className="flex gap-2">
        <button
          type="button"
          onClick={onClose}
          className="rounded-full border border-slate-900 px-5 py-3 text-sm font-medium"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={status === "sending"}
          className="flex-1 rounded-full bg-[#111] py-3 text-sm font-medium text-white shadow-[0_14px_30px_-12px_rgba(0,0,0,0.6)] hover:bg-black disabled:opacity-60"
        >
          {status === "sending" ? "AI is checking your report…" : "Submit anonymously"}
        </button>
      </div>
      <p className="text-xs text-slate-500">
        In an emergency, call <strong>112</strong> or the Women Helpline <strong>181</strong>.
      </p>
    </form>
  );
}
