/**
 * Provenance of a stored activity, for ONE question: may this record feed AI prompts, derived coaching
 * analytics or anything that leaves the athlete's own view?
 *
 * Why this exists: the Strava API Agreement (effective 2026-06-01; summarized from the published text, so
 * the owner should confirm the wording with Strava or counsel) restricts using Strava data, and data derived
 * from it, for AI/ML purposes, including placing it in a model's context window. That follows the data when it
 * is relayed through another service (Intervals.icu forwards Strava activities with `source: "STRAVA"`).
 *
 * The rule here is a WHITELIST of positively-known origins, not a blacklist of Strava:
 *  - `strava`  → restricted;
 *  - `unknown` → restricted too (unknown ≠ safe; missing provenance is not treated as "not Strava");
 *  - `allowed` → origin is known and is not Strava.
 *
 * Existing legacy callers already exclude Strava rows in their own way (see api/coach/route.ts and
 * coach-personal-context.ts). New code (stream analysis, workout revision history, interval editing context)
 * must go through `filterForAi` / `assertAiEligible` instead of re-implementing the check.
 */

export type Provenance = "allowed" | "strava" | "unknown";

export interface ProvenanceFields {
  source?: string | null;
  externalId?: string | null;
  /** Free-text note written by an importer. Intervals imports record "Original source: <PROVIDER>". */
  notes?: string | null;
  /** Explicit upstream origin when an importer captured it. */
  originalSource?: string | null;
}

/** Sources written by JMM's own importers whose origin is the athlete's own file/entry or a non-Strava API. */
const DIRECT_NON_STRAVA = new Set([
  "manual", "plan", "garmin", "coros", "apple", "apple_health", "whoop", "oura", "tcx", "fit", "garmin_csv", "file", "jmm", "app",
]);
/** Same upstream whitelist as intervals-ingest.ts. Kept here so the two cannot silently drift (test asserts equality). */
export const INTERVALS_ALLOWED_UPSTREAM = ["UPLOAD", "MANUAL", "GARMIN_CONNECT", "OAUTH_CLIENT", "DROPBOX", "POLAR", "SUUNTO", "COROS", "WAHOO", "ZWIFT", "ZEPP", "CONCEPT2", "HUAWEI"] as const;
const upstream = new Set<string>(INTERVALS_ALLOWED_UPSTREAM);

const norm = (value: unknown) => (typeof value === "string" ? value.trim().toLowerCase() : "");
const looksStrava = (value: unknown) => /(^|[^a-z])strava([^a-z]|$)/.test(norm(value));

/** "Original source: STRAVA." as written by intervals-ingest. Returns the upstream token or null. */
export function intervalsUpstreamFromNotes(notes: string | null | undefined): string | null {
  const match = /Original source:\s*([A-Za-z0-9_]+)/.exec(notes || "");
  return match ? match[1].toUpperCase() : null;
}

export function provenanceOf(row: ProvenanceFields): Provenance {
  const source = norm(row.source);
  const external = norm(row.externalId);
  // Any Strava marker anywhere wins, even if another field looks harmless.
  if (looksStrava(source) || looksStrava(row.originalSource) || /^strava[:_-]/.test(external)) return "strava";
  const noteUpstream = intervalsUpstreamFromNotes(row.notes);
  if (noteUpstream === "STRAVA") return "strava";
  const original = (row.originalSource || "").trim().toUpperCase();
  if (original) return upstream.has(original) ? "allowed" : "unknown";
  if (source === "intervals") {
    // A relayed record is only as trustworthy as its recorded upstream. No upstream recorded → unknown.
    return noteUpstream && upstream.has(noteUpstream) ? "allowed" : "unknown";
  }
  if (DIRECT_NON_STRAVA.has(source)) return "allowed";
  return "unknown";
}

export const isStravaOrigin = (row: ProvenanceFields) => provenanceOf(row) === "strava";
export const isAiEligible = (row: ProvenanceFields) => provenanceOf(row) === "allowed";

/** Keeps only rows whose origin is positively known not to be Strava. */
export function filterForAi<T extends ProvenanceFields>(rows: readonly T[]): { kept: T[]; excluded: { strava: number; unknown: number } } {
  const excluded = { strava: 0, unknown: 0 };
  const kept: T[] = [];
  for (const row of rows) {
    const origin = provenanceOf(row);
    if (origin === "allowed") kept.push(row);
    else excluded[origin] += 1;
  }
  return { kept, excluded };
}

export class StravaRestrictedError extends Error {
  readonly code = "strava_restricted";
  constructor(readonly provenance: Exclude<Provenance, "allowed">) {
    super(provenance === "strava"
      ? "Strava-origin data cannot be used for AI or derived coaching analysis."
      : "This record's origin is unknown, so it is not used for AI or derived coaching analysis.");
  }
}

/** For code paths that take ONE record (e.g. stream analysis of a single activity): fail closed. */
export function assertAiEligible(row: ProvenanceFields): void {
  const origin = provenanceOf(row);
  if (origin !== "allowed") throw new StravaRestrictedError(origin);
}

/**
 * Wording for the athlete-facing setup screen (EN/ES). It states only behavior that tests enforce: Strava-origin
 * records never reach an AI provider or the new stream/revision analysis. It does not claim that older local
 * load displays ignore Strava activities, because they do not (see docs/strava-and-provider-limits.md).
 */
export const STRAVA_AI_NOTICE = {
  en: "Strava activities are imported for your own records. JMM's AI features do not receive Strava-origin data.",
  es: "Las actividades de Strava se importan para tus propios registros. Las funciones de IA de JMM no reciben datos de origen Strava.",
} as const;
