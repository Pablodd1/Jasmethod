// Athlinks connector — RACE-HISTORY provider, not daily recovery.
//
// Athlinks documents an API-key developer portal with athlete lookup and
// complete athlete race-result history. Model:
//   - ATHLINKS_API_KEY lives server-side only (never exposed to the client)
//   - No athlete passwords: we store only the confirmed Athlinks RacerID on
//     the athlete's Connector row (externalRef)
//   - One-time identity match: search → athlete confirms the right profile
//   - Results import into the Race table with provenance + dedupe
//   - Reconciliation runs DAILY (race history, not continuous data)
//
// ENDPOINT NOTE: paths below are centralized here so they can be adjusted in
// one place against the live developer portal (api.athlinks.com). If a path
// changes, only this file moves.

import { prisma } from "./db";

const BASE = "https://api.athlinks.com";

function key(): string | null {
  return process.env.ATHLINKS_API_KEY || null;
}

export function athlinksConfigured(): boolean {
  return !!key();
}

async function athlinksGet<T>(path: string, params: Record<string, string> = {}): Promise<T> {
  const apiKey = key();
  if (!apiKey) throw new Error("ATHLINKS_API_KEY not configured");
  const qs = new URLSearchParams({ apiKey, ...params });
  const r = await fetch(`${BASE}${path}?${qs}`, {
    signal: AbortSignal.timeout(15000),
  });
  if (!r.ok)
    throw new Error(`Athlinks ${path} failed: HTTP ${r.status}`);
  return (await r.json()) as T;
}

// ---- Raw API shapes (tolerant — Athlinks field names vary by endpoint) ----
export interface AthlinksAthlete {
  racerId: number | string;
  athleteId?: number | string;
  name: string;
  firstName?: string;
  lastName?: string;
  location?: string;
}

export interface AthlinksResultRaw {
  resultId?: number | string;
  eventId?: number | string;
  courseId?: number | string;
  eventName?: string;
  raceName?: string;
  eventDate?: string;
  date?: string;
  distance?: number | string;
  distanceName?: string; // "Olympic", "Half Ironman", "5K", ...
  divisionName?: string; // discipline/category
  overallTime?: string;  // "2:31:07"
  finishTime?: string;
  time?: string;
  overallRank?: number | string;
  overallPlace?: number | string;
  genderRank?: number | string;
  genderPlace?: number | string;
  divisionRank?: number | string;
  ageGroupRank?: number | string;
}

// ---- Normalization ----

export interface NormalizedRaceResult {
  sourceRecordId: string;
  externalEventId?: string;
  name: string;
  date: Date;
  distanceLabel?: string;
  discipline?: string;
  finishTimeSec?: number;
  placeOverall?: number;
  placeGender?: number;
  placeAgeGroup?: number;
}

/** "1:23:45" | "83:45" | "45:12.3" → seconds; null when unparseable. */
export function parseFinishTimeSec(raw?: string | number): number | null {
  if (raw == null) return null;
  if (typeof raw === "number" && Number.isFinite(raw)) {
    // Seconds for any real finish are < 1,000,000 (11.5 days); ms values for
    // real finishes are > 1,000,000 (past ~17 min). The ranges don't overlap.
    return raw > 1_000_000 ? Math.round(raw / 1000) : Math.round(raw);
  }
  const parts = String(raw).trim().split(":").map((p) => parseFloat(p));
  if (!parts.length || parts.some((p) => !Number.isFinite(p))) return null;
  let sec = 0;
  for (const p of parts) sec = sec * 60 + p;
  return Math.round(sec) || null;
}

export function normalizeResult(r: AthlinksResultRaw): NormalizedRaceResult | null {
  const id = r.resultId ?? `${r.eventId ?? "?"}:${r.courseId ?? "?"}`;
  if (id === "?" || id === "?:?") return null;
  const dateRaw = r.eventDate || r.date;
  const date = dateRaw ? new Date(dateRaw) : null;
  if (!date || isNaN(date.getTime())) return null;
  const name = r.eventName || r.raceName;
  if (!name) return null;
  const sec =
    parseFinishTimeSec(r.overallTime || r.finishTime || r.time) ?? undefined;
  const num = (v?: number | string) => {
    const n = typeof v === "string" ? parseInt(v, 10) : v;
    return typeof n === "number" && Number.isFinite(n) ? n : undefined;
  };
  return {
    sourceRecordId: String(id),
    externalEventId: r.eventId != null ? String(r.eventId) : undefined,
    name,
    date,
    distanceLabel: r.distanceName ?? (r.distance != null ? String(r.distance) : undefined),
    discipline: r.divisionName?.split(" - ")[0],
    finishTimeSec: sec,
    placeOverall: num(r.overallRank ?? r.overallPlace),
    placeGender: num(r.genderRank ?? r.genderPlace),
    placeAgeGroup: num(r.divisionRank ?? r.ageGroupRank),
  };
}

// ---- Map a normalized result onto the app's Race.distance vocabulary ----
// Race.distance is: sprint | olympic | half | full | hyrox | run-only style
// labels. Athlinks gives names like "Sprint", "Olympic", "70.3", "140.6", "5K".
export function mapDistance(label?: string): string {
  if (!label) return "other";
  const l = label.toLowerCase();
  if (l.includes("sprint") && !l.includes("iron")) return "sprint";
  if (l.includes("olympic") || l.includes("international")) return "olympic";
  if (l.includes("70.3") || l.includes("half iron") || l.includes("half-iron")) return "half";
  if (l.includes("140.6") || l.includes("ironman") || l.includes("full")) return "full";
  if (l.includes("hyrox")) return "hyrox";
  if (l.includes("super")) return "sprint";
  return "other";
}

// ---- API surface used by routes ----

export async function searchAthletes(query: string): Promise<AthlinksAthlete[]> {
  const raw = await athlinksGet<any>("/v1/athletes/search", { q: query });
  const list: any[] = Array.isArray(raw)
    ? raw
    : Array.isArray(raw?.results)
      ? raw.results
      : Array.isArray(raw?.athletes)
        ? raw.athletes
        : [];
  return list
    .map((a: any) => ({
      racerId: a.racerId ?? a.athleteId ?? a.id,
      name:
        a.name ||
        [a.firstName, a.lastName].filter(Boolean).join(" ") ||
        String(a.racerId ?? a.id ?? ""),
      location: a.location || a.cityRegion,
    }))
    .filter((a: AthlinksAthlete) => a.racerId != null && a.name);
}

export async function getAthleteResults(racerId: string): Promise<NormalizedRaceResult[]> {
  const raw = await athlinksGet<any>(`/v1/athletes/${encodeURIComponent(racerId)}/results`);
  const list: any[] = Array.isArray(raw)
    ? raw
    : Array.isArray(raw?.results)
      ? raw.results
      : [];
  return list
    .map(normalizeResult)
    .filter((x): x is NormalizedRaceResult => x !== null);
}

// ---- Import with dedupe ----
// Dedupe rules (spec §6/§7):
//   1. Same athlete + source=athlinks + same sourceRecordId → update in place.
//   2. Manual/other-source race with the same name AND date within ±2 days →
//      do NOT create a duplicate; fill missing fields (resultMin, places) on
//      the existing record instead.
// Priority: Athlinks is authoritative for OFFICIAL race results; it writes
// resultMin but never overwrites a non-empty manual resultMin.
export async function importAthlinksResults(
  userId: string,
  results: NormalizedRaceResult[],
): Promise<{ imported: number; merged: number }> {
  let imported = 0,
    merged = 0;
  const existing = await prisma.race.findMany({
    where: { userId },
    select: {
      id: true, name: true, date: true, resultMin: true,
      source: true, sourceRecordId: true,
    },
  });
  for (const r of results) {
    const dup = existing.find(
      (e) =>
        (e.source === "athlinks" && e.sourceRecordId === r.sourceRecordId) ||
        (e.name.trim().toLowerCase() === r.name.trim().toLowerCase() &&
          Math.abs(e.date.getTime() - r.date.getTime()) <= 2 * 86400000),
    );
    const data = {
      resultMin: r.finishTimeSec != null ? +(r.finishTimeSec / 60).toFixed(2) : undefined,
      sourceRetrievedAt: new Date(),
    };
    if (dup) {
      // Never overwrite an official result we already recorded (or a manual one)
      const update = dup.resultMin == null ? data : { sourceRetrievedAt: data.sourceRetrievedAt };
      await prisma.race.update({ where: { id: dup.id }, data: update });
      merged++;
      continue;
    }
    await prisma.race.create({
      data: {
        userId,
        name: r.name,
        distance: mapDistance(r.distanceLabel || r.discipline),
        date: r.date,
        resultMin: data.resultMin,
        source: "athlinks",
        sourceRecordId: r.sourceRecordId,
        sourceRetrievedAt: new Date(),
        notes: [
          r.distanceLabel ? `Athlinks: ${r.distanceLabel}` : null,
          r.placeOverall != null ? `Overall place ${r.placeOverall}` : null,
          r.placeGender != null ? `Gender place ${r.placeGender}` : null,
          r.placeAgeGroup != null ? `Age-group place ${r.placeAgeGroup}` : null,
        ]
          .filter(Boolean)
          .join(" · "),
      },
    });
    imported++;
    existing.push({
      id: "", name: r.name, date: r.date, resultMin: data.resultMin ?? null,
      source: "athlinks", sourceRecordId: r.sourceRecordId,
    });
  }
  return { imported, merged };
}

// ---- Daily reconciliation (called by the daily sync cron, not hourly) ----
export async function syncAthlinksForAllUsers(): Promise<{
  users: number; imported: number; merged: number; errors: string[];
}> {
  const conns = await prisma.connector.findMany({
    where: { provider: "athlinks", status: "connected", externalRef: { not: null } },
  });
  let imported = 0,
    merged = 0;
  const errors: string[] = [];
  for (const conn of conns) {
    try {
      const results = await getAthleteResults(conn.externalRef!);
      const res = await importAthlinksResults(conn.userId, results);
      imported += res.imported;
      merged += res.merged;
      await prisma.connector.update({
        where: { id: conn.id },
        data: {
          lastSyncAt: new Date(),
          lastSyncCount: res.imported,
          status: "connected",
          lastError: null,
        },
      });
    } catch (e: any) {
      const error = String(e?.message || "Athlinks sync failed").slice(0, 250);
      errors.push(error);
      await prisma.connector.update({
        where: { id: conn.id },
        data: { status: "error", lastError: error },
      });
    }
  }
  return { users: conns.length, imported, merged, errors };
}
