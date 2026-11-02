// Types shared by the safest-route API and the route panel / map.
import type { Category, LatLng, TimeOfDay } from "./types";

export type RouteLevel = "clear" | "low" | "medium" | "high";

export interface RouteSpot {
  id: string;
  title: string;
  category: Category;
  severity: number;
  lat: number;
  lng: number;
  /** Metres from the route */
  distanceM: number;
  verified: boolean;
}

export interface ScoredRoute {
  id: string;
  /** [lat, lng] pairs */
  coords: [number, number][];
  distanceKm: number;
  walkMin: number;
  risk: number;
  level: RouteLevel;
  /** Reported spots within reach of the route, worst first (top few) */
  spots: RouteSpot[];
  /** All reported spots within reach, including those not listed in `spots` */
  spotCount: number;
  /** Staffed safe places along the way */
  help: { police: number; metro: number; hospital: number; fuel: number };
  tags: ("safest" | "fastest")[];
  reason: string;
}

export interface RouteResult {
  from: LatLng;
  to: LatLng;
  timeOfDay: TimeOfDay;
  /** Safest first */
  routes: ScoredRoute[];
}

export const ROUTE_LEVELS: Record<RouteLevel, { label: string; color: string; bg: string }> = {
  clear: { label: "No reports", color: "#059669", bg: "#ecfdf5" },
  low: { label: "Low risk", color: "#16a34a", bg: "#f0fdf4" },
  medium: { label: "Some risk", color: "#d97706", bg: "#fffbeb" },
  high: { label: "Higher risk", color: "#dc2626", bg: "#fef2f2" },
};

/** Map line colours: the selected route is drawn in its risk colour, others in grey. */
export const ROUTE_LINE = { selected: "#5b2be0", other: "#94a3b8" };

/** Walks longer than this aren't offered. */
export const MAX_ROUTE_KM = 15;
