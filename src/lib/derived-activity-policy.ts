import { provenanceOf, type ProvenanceFields } from "./strava-provenance";

export interface DerivedActivityPolicy {
  status: "allowed" | "insufficient";
  reason: string | null;
  restrictedRecords: { strava: number; unknown: number };
}

/** Positive origin evidence is required for derived analytics. Raw athlete
 * history stays intact; never drop restricted work and call the remainder a
 * complete load, a rest day or evidence of additional training capacity. */
export function derivedActivityPolicy(rows: readonly ProvenanceFields[]): DerivedActivityPolicy {
  const restrictedRecords = { strava: 0, unknown: 0 };
  for (const row of rows) {
    // Direct Garmin is positively identified for LOCAL deterministic analysis only.
    // filterForAi/isAiEligible deliberately keep this source excluded.
    const origin = localOrigin(row);
    if (origin !== "allowed") restrictedRecords[origin]++;
  }
  const restricted = restrictedRecords.strava + restrictedRecords.unknown > 0;
  return {
    status: restricted ? "insufficient" : "allowed",
    reason: restricted ? "Derived training analytics are unavailable because activity includes Strava-origin or unknown-origin data. Excluding that work would understate training; saved source records remain available." : null,
    restrictedRecords,
  };
}

const localOrigin = (row: ProvenanceFields) => provenanceOf(row) === "strava" ? "strava" : row.source === "garmin_direct" && row.externalId?.startsWith("garmin:") ? "allowed" : provenanceOf(row);
export const isDerivedActivityEligible = (row: ProvenanceFields) => localOrigin(row) === "allowed";
