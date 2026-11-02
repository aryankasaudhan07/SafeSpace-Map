import type { Report } from "./types";

// Community verification rules, shared by client and server.

const DAY = 86_400_000;

/** Disputed by several people and by more people than confirmed it: removed from map and summaries. */
export function isHidden(r: Pick<Report, "confirms" | "disputes">) {
  const confirms = r.confirms ?? 0;
  const disputes = r.disputes ?? 0;
  return disputes >= 3 && disputes > confirms;
}

export function trustStatus(r: Pick<Report, "confirms" | "disputes">): "verified" | "unverified" | "disputed" {
  const confirms = r.confirms ?? 0;
  const disputes = r.disputes ?? 0;
  if (disputes > 0 && disputes >= confirms) return "disputed";
  if (confirms >= 2) return "verified";
  return "unverified";
}

/**
 * 0.2–1: how much a report counts in heatmaps and risk levels.
 * A lone unconfirmed report counts ~half; each confirmation adds weight, disputes and age take it away.
 */
export function trustWeight(r: Pick<Report, "confirms" | "disputes" | "createdAt">) {
  const confirms = r.confirms ?? 0;
  const disputes = r.disputes ?? 0;
  let w = 0.5 + 0.15 * Math.min(confirms, 4) - 0.2 * disputes;
  const ageDays = (Date.now() - new Date(r.createdAt).getTime()) / DAY;
  if (ageDays > 180) w *= 0.5;
  else if (ageDays > 90) w *= 0.75;
  return Math.min(1, Math.max(0.2, w));
}
