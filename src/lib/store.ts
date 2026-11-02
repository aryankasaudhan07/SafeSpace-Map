import { createClient } from "@supabase/supabase-js";
import { promises as fs } from "fs";
import path from "path";
import { DEMO_REPORTS } from "./seed";
import { isHidden } from "./trust";
import type { Category, Report, TimeOfDay } from "./types";

// Without Supabase configured, reports and votes are kept in data/*.json (local dev).
// On a read-only filesystem (e.g. Vercel) they survive only in memory.
const DATA_DIR = path.join(process.cwd(), "data");
const REPORTS_FILE = path.join(DATA_DIR, "reports.json");
const VOTES_FILE = path.join(DATA_DIR, "votes.json");

/** Stored report: includes a salted hash of the reporter's device, never exposed by the API. */
type StoredReport = Report & { reporterHash?: string };
export type VoteKind = "confirm" | "dispute";
interface Vote {
  reportId: string;
  voter: string;
  vote: VoteKind;
}

/** Strips private fields before a report leaves the server. */
function toPublic(r: StoredReport): Report {
  const copy = { ...r };
  delete copy.reporterHash;
  return copy;
}

let memReports: StoredReport[] | null = null;
let memVotes: Vote[] | null = null;

function supabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_ANON_KEY;
  return url && key ? createClient(url, key, { auth: { persistSession: false } }) : null;
}

export function storageMode() {
  return supabase() ? "supabase" : "local";
}

interface Row {
  id: string;
  created_at: string;
  lat: number;
  lng: number;
  category: string;
  severity: number;
  title: string;
  description: string;
  time_of_day: string;
  reporter_hash: string | null;
}

const fromRow = (r: Row): StoredReport => ({
  id: r.id,
  createdAt: r.created_at,
  lat: r.lat,
  lng: r.lng,
  category: r.category as Category,
  severity: r.severity,
  title: r.title,
  description: r.description,
  timeOfDay: r.time_of_day as TimeOfDay,
  reporterHash: r.reporter_hash ?? undefined,
});

async function readJson<T>(file: string): Promise<T[]> {
  try {
    return JSON.parse(await fs.readFile(file, "utf8")) as T[];
  } catch {
    return [];
  }
}

async function writeJson(file: string, data: unknown) {
  try {
    await fs.mkdir(DATA_DIR, { recursive: true });
    await fs.writeFile(file, JSON.stringify(data, null, 2));
  } catch {
    // read-only filesystem: keep in memory only
  }
}

async function storedReports(): Promise<StoredReport[]> {
  const db = supabase();
  if (!db) return (memReports ??= await readJson<StoredReport>(REPORTS_FILE));
  const { data, error } = await db.from("reports").select("*").order("created_at", { ascending: false }).limit(2000);
  if (error) throw error;
  return (data as Row[]).map(fromRow);
}

async function votes(): Promise<Vote[]> {
  const db = supabase();
  if (!db) return (memVotes ??= await readJson<Vote>(VOTES_FILE));
  const { data, error } = await db.from("report_votes").select("report_id, voter_hash, vote").limit(20000);
  if (error) throw error;
  return (data as { report_id: string; voter_hash: string; vote: VoteKind }[]).map((v) => ({
    reportId: v.report_id,
    voter: v.voter_hash,
    vote: v.vote,
  }));
}

/**
 * Every report the public should see: real + demo, with community vote counts,
 * minus reports the community has disputed.
 */
export async function visibleReports(): Promise<Report[]> {
  const [real, allVotes] = await Promise.all([storedReports(), votes()]);
  const counts = new Map<string, { confirms: number; disputes: number }>();
  for (const v of allVotes) {
    const c = counts.get(v.reportId) ?? { confirms: 0, disputes: 0 };
    if (v.vote === "confirm") c.confirms++;
    else c.disputes++;
    counts.set(v.reportId, c);
  }

  return [...real, ...DEMO_REPORTS]
    .map(toPublic)
    .map((r) => {
      const c = counts.get(r.id);
      return { ...r, confirms: (r.confirms ?? 0) + (c?.confirms ?? 0), disputes: (r.disputes ?? 0) + (c?.disputes ?? 0) };
    })
    .filter((r) => !isHidden(r));
}

/** Recent descriptions, for blocking copy-paste spam. */
export async function recentDescriptions(sinceMs: number) {
  const cutoff = Date.now() - sinceMs;
  return (await storedReports()).filter((r) => new Date(r.createdAt).getTime() >= cutoff).map((r) => r.description);
}

export async function addReport(input: Omit<Report, "id" | "createdAt">, reporterHash: string): Promise<Report> {
  const db = supabase();
  if (db) {
    const { data, error } = await db
      .from("reports")
      .insert({
        lat: input.lat,
        lng: input.lng,
        category: input.category,
        severity: input.severity,
        title: input.title,
        description: input.description,
        time_of_day: input.timeOfDay,
        reporter_hash: reporterHash,
      })
      .select()
      .single();
    if (error) throw error;
    return toPublic(fromRow(data as Row));
  }

  const report: Report = { ...input, id: crypto.randomUUID(), createdAt: new Date().toISOString() };
  const all = await storedReports();
  all.unshift({ ...report, reporterHash });
  await writeJson(REPORTS_FILE, all);
  return report;
}

export type VoteResult = "ok" | "own_report" | "not_found";

/** One vote per voter per report; voting again replaces the earlier vote. */
export async function castVote(reportId: string, voter: string, vote: VoteKind): Promise<VoteResult> {
  const isDemo = reportId.startsWith("demo-");
  if (isDemo) {
    if (!DEMO_REPORTS.some((r) => r.id === reportId)) return "not_found";
  } else {
    const report = (await storedReports()).find((r) => r.id === reportId);
    if (!report) return "not_found";
    if (report.reporterHash === voter) return "own_report";
  }

  const db = supabase();
  if (db) {
    const { error } = await db
      .from("report_votes")
      .upsert({ report_id: reportId, voter_hash: voter, vote }, { onConflict: "report_id,voter_hash" });
    if (error) throw error;
    return "ok";
  }

  const all = await votes();
  const existing = all.find((v) => v.reportId === reportId && v.voter === voter);
  if (existing) existing.vote = vote;
  else all.push({ reportId, voter, vote });
  await writeJson(VOTES_FILE, all);
  return "ok";
}
