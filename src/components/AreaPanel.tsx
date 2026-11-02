"use client";

import { useEffect, useState } from "react";
import { IconBadge } from "@/components/Icon";
import type { Hotspot } from "@/lib/hotspots";
import type { IconName } from "@/lib/icons";
import { directionsUrl, type NearbyPlace } from "@/lib/safety";
import type { AreaSummary, LatLng } from "@/lib/types";

const LEVEL_STYLE: Record<AreaSummary["level"], { label: string; cls: string }> = {
  low: { label: "Low risk", cls: "bg-emerald-100 text-emerald-800" },
  moderate: { label: "Moderate risk", cls: "bg-amber-100 text-amber-800" },
  high: { label: "High risk", cls: "bg-rose-100 text-rose-800" },
};

interface Props {
  focus: LatLng;
  /** Heading for the panel, e.g. your location or a metro station */
  label?: { text: string; icon: IconName; color: string } | null;
  includeDemo: boolean;
  onClear: () => void;
  /** Police stations found for this area, so the map can show them */
  onPolice?: (police: NearbyPlace[]) => void;
  onShowPoint?: (p: LatLng) => void;
}

interface State {
  loading: boolean;
  summary: AreaSummary | null;
  police: NearbyPlace[];
  hotspots: Hotspot[];
  error?: string;
}

const EMPTY: State = { loading: true, summary: null, police: [], hotspots: [] };

export default function AreaPanel({ focus, label, includeDemo, onClear, onPolice, onShowPoint }: Props) {
  const [state, setState] = useState<State>(EMPTY);

  useEffect(() => {
    const ctrl = new AbortController();
    setState(EMPTY);
    fetch("/api/summary", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...focus, includeDemo }),
      signal: ctrl.signal,
    })
      .then((r) => r.json())
      .then((d) => {
        setState({ loading: false, summary: d.summary, police: d.police ?? [], hotspots: d.hotspots ?? [], error: d.error });
        onPolice?.(d.police ?? []);
      })
      .catch((e) => {
        if (e.name !== "AbortError") setState({ ...EMPTY, loading: false, error: "Couldn't load summary." });
      });
    return () => ctrl.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focus, includeDemo]);

  return (
    <div className="rounded-[26px] bg-[#f3f0fe] p-5">
      <div className="flex items-start justify-between gap-2">
        <p className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-violet-700">
          {label && <IconBadge name={label.icon} color={label.color} size={22} />}
          {label?.text ?? "Area check"} · 1 km radius
        </p>
        <button onClick={onClear} className="text-xs text-violet-700 hover:underline">
          Clear
        </button>
      </div>

      {state.loading && (
        <div className="mt-3 space-y-2" aria-busy="true">
          <div className="h-4 w-3/4 animate-pulse rounded bg-violet-200/70" />
          <div className="h-3 w-full animate-pulse rounded bg-violet-200/50" />
          <div className="h-3 w-5/6 animate-pulse rounded bg-violet-200/50" />
          <p className="pt-1 text-xs text-violet-700">AI is reading nearby reports…</p>
        </div>
      )}

      {!state.loading && state.error && <p className="mt-2 text-sm text-red-700">{state.error}</p>}

      {!state.loading && !state.error && (
        <div className="mt-2 space-y-4">
          {state.summary ? (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${LEVEL_STYLE[state.summary.level].cls}`}>
                  {LEVEL_STYLE[state.summary.level].label}
                </span>
                <span className="text-xs text-slate-500">
                  {state.summary.count} report{state.summary.count === 1 ? "" : "s"} · Peak: {state.summary.peakTimes}
                </span>
              </div>
              <p className="font-semibold leading-snug">{state.summary.headline}</p>
              <p className="text-sm text-slate-700">{state.summary.summary}</p>
              <div>
                <p className="text-xs font-semibold text-slate-600">Safety tips</p>
                <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-slate-700">
                  {state.summary.tips.map((t) => (
                    <li key={t}>{t}</li>
                  ))}
                </ul>
              </div>
            </div>
          ) : (
            <p className="text-sm text-slate-700">
              No reports within 1 km of this spot yet. Felt unsafe here? Report it so the next woman is warned.
            </p>
          )}

          {state.police.length > 0 && (
            <div>
              <p className="mb-2 flex items-center gap-2 text-xs font-semibold text-slate-600">
                <IconBadge name="police" color="#1d4ed8" size={22} /> Nearest police stations
              </p>
              <ul className="space-y-1.5">
                {state.police.map((p) => (
                  <li key={p.id} className="flex items-center justify-between gap-2 rounded-2xl bg-white p-3">
                    <button onClick={() => onShowPoint?.(p)} className="min-w-0 text-left">
                      <p className="truncate text-sm font-semibold">{p.name}</p>
                      <p className="text-xs text-slate-500">
                        {p.distanceKm} km · ~{p.walkMin} min walk
                      </p>
                    </button>
                    <div className="flex shrink-0 gap-1.5">
                      {p.phone && (
                        <a href={`tel:${p.phone}`} className="rounded-full bg-soft px-3 py-1 text-xs font-medium">
                          Call
                        </a>
                      )}
                      <a href={directionsUrl(p)} target="_blank" rel="noreferrer" className="rounded-full bg-[#111] px-3.5 py-1 text-xs font-medium text-white">
                        Go
                      </a>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {state.hotspots.length > 0 && (
            <div>
              <p className="mb-2 flex items-center gap-2 text-xs font-semibold text-slate-600">
                <IconBadge name="warning" color="#e11d48" size={22} /> Unsafe zones within 3 km
              </p>
              <ul className="space-y-1.5">
                {state.hotspots.map((h) => (
                  <li key={`${h.lat},${h.lng}`}>
                    <button
                      onClick={() => onShowPoint?.(h)}
                      className="flex w-full items-center justify-between gap-2 rounded-2xl bg-white p-3 text-left transition hover:bg-rose-50"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold">{h.near ? `Near ${h.near}` : `${h.distanceKm} km ${h.direction}`}</p>
                        <p className="text-xs text-slate-500">
                          {h.count} reports · mostly {h.topCategory.toLowerCase()} · severity {h.avgSeverity}/5
                        </p>
                      </div>
                      <span className="shrink-0 rounded-full bg-rose-100 px-2 py-0.5 text-[11px] font-medium text-rose-800">
                        {h.distanceKm} km {h.direction}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {state.summary && (
            <p className="text-[11px] text-slate-400">
              {state.summary.aiSource === "gemini" ? `Summary by ${state.summary.aiModel ?? "Gemini"}` : "Rule-based summary (AI unavailable)"}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
