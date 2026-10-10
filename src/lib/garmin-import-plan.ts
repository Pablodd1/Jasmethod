import { createHash } from "node:crypto";
import { dateKey } from "./dates";
import type { GarminFileWorkout } from "./garmin-file-import";

export const GARMIN_IMPORT_VERSION = "garmin-reviewed-file-v1";
export type ImportDisposition = "new" | "updated" | "duplicate" | "skipped";
export type ImportCounts = { new: number; updated: number; duplicate: number; skipped: number; rejected: number };
export const GARMIN_IMPORT_FIELDS = ["date", "sport", "title", "durationMin", "distanceKm", "avgHr", "maxHr", "avgPower", "np", "tss", "calories"] as const;
export type ExistingGarminActivity = {
  id: string; source: string; externalId: string | null; date: Date; sport: string;
  durationMin: number; title: string; planned: boolean; completed: boolean;
  actualDurationMin?: number | null; feedbackStatus?: string | null;
  [key: string]: unknown;
};
export type PlannedGarminImport = { workout: GarminFileWorkout; status: ImportDisposition; existingId?: string; reason: string };

export function importedFields(workout: GarminFileWorkout) {
  return Object.fromEntries(GARMIN_IMPORT_FIELDS.filter(key => workout[key] !== undefined && workout[key] !== null).map(key => [key, workout[key]]));
}
function value(key: string, input: unknown) { return key === "date" ? new Date(input as Date).toISOString() : input; }
function sameValues(a: GarminFileWorkout, b: ExistingGarminActivity | GarminFileWorkout) {
  return Object.entries(importedFields(a)).every(([key, next]) => value(key, next) === value(key, b[key as keyof typeof b]));
}
function fileManaged(row: ExistingGarminActivity) {
  return row.source === "garmin" && !row.planned && row.completed && !row.feedbackStatus && !row.feedbackAt && row.rpe == null && !row.actualSport && /^(?:garmin-file:|garmin-csv:|tcx:)/.test(row.externalId || "");
}
function nearby(a: GarminFileWorkout, b: { date: Date; sport: string }) {
  return a.sport === b.sport && Math.abs(a.date.getTime() - b.date.getTime()) <= 60_000;
}
function compatible(a: GarminFileWorkout, b: { durationMin: number; distanceKm?: unknown }) {
  if (Math.abs(a.durationMin - b.durationMin) > 1) return false;
  return typeof a.distanceKm !== "number" || typeof b.distanceKm !== "number" || Math.abs(a.distanceKm - b.distanceKm) <= Math.max(.1, a.distanceKm * .02);
}

/** Conservative reconciliation. Provider identity can update file imports;
 * approximate or foreign-source matches never overwrite an athlete's history. */
export function planGarminImport(workouts: GarminFileWorkout[], existing: ExistingGarminActivity[], timezone = "UTC") {
  const plans: PlannedGarminImport[] = [];
  const groups = new Map<string, GarminFileWorkout[]>();
  for (const workout of workouts) {
    const key = `${workout.source}:${workout.externalId}`;
    groups.set(key, [...(groups.get(key) || []), workout]);
  }
  const conflicts = new Set([...groups.entries()].filter(([, rows]) => rows.some(row => !sameValues(row, rows[0]) || !sameValues(rows[0], row))).map(([key]) => key));
  const seen: GarminFileWorkout[] = [];
  for (const workout of workouts) {
    const key = `${workout.source}:${workout.externalId}`;
    if (conflicts.has(key)) { plans.push({ workout, status: "skipped", reason: "Conflicting rows share the same activity identity. Review the source file; neither version is saved." }); continue; }
    const earlier = seen.filter(row => nearby(workout, row));
    seen.push(workout);
    if (earlier.length) {
      plans.push({ workout, status: earlier.length === 1 && compatible(workout, earlier[0]) ? "duplicate" : "skipped", reason: "A matching or conflicting activity already appears in this file. No second activity is added." }); continue;
    }
    const identities = new Set([workout.externalId, ...(workout.legacyExternalIds || [])]);
    const exact = existing.filter(row => row.source === workout.source && row.externalId != null && identities.has(row.externalId));
    if (exact.length > 1) { plans.push({ workout, status: "skipped", reason: "More than one saved activity has this identity. Review existing history first." }); continue; }
    if (exact.length === 1) {
      const row = exact[0];
      if (!fileManaged(row)) { plans.push({ workout, status: "skipped", existingId: row.id, reason: "This identity belongs to protected or separately recorded history. It will not be overwritten." }); continue; }
      // Corrections must not silently move a linked activity to another day/sport.
      if (row.sport !== workout.sport || Math.abs(row.date.getTime() - workout.date.getTime()) > 60_000) {
        plans.push({ workout, status: "skipped", existingId: row.id, reason: "The saved activity has a different time or sport. Review the conflicting history before replacing it." }); continue;
      }
      plans.push({ workout, status: sameValues(workout, row) && row.actualDurationMin === workout.durationMin ? "duplicate" : "updated", existingId: row.id, reason: "Matched the same Garmin file activity identity. Only supplied imported measurements change; notes, feedback and plans stay saved." }); continue;
    }
    const near = existing.filter(row => (row.completed || row.actualDurationMin != null || ["partial", "substituted"].includes(String(row.feedbackStatus))) && nearby(workout, row));
    if (near.length) {
      const same = near.length === 1 && compatible(workout, near[0]);
      plans.push({ workout, status: same ? "duplicate" : "skipped", existingId: same ? near[0].id : undefined, reason: same ? "A similar completed activity is already saved, possibly from another format or provider. It is kept unchanged." : "Possible duplicate or conflicting activity near this start time. Review history; nothing is overwritten or added." }); continue;
    }
    const performedPlans = existing.filter(row => row.planned && (row.actualSport || row.sport) === workout.sport &&
      (row.completed || (row.actualDurationMin ?? 0) > 0 || ["partial", "substituted"].includes(String(row.feedbackStatus))) &&
      dateKey(row.date, timezone) === dateKey(workout.date, timezone));
    if (performedPlans.length) {
      plans.push({ workout, status: "skipped", reason: "A performed planned session is already recorded for this sport and day. Review the possible match in history before adding another completed activity." }); continue;
    }
    plans.push({ workout, status: "new", reason: "No matching saved activity found. A completed activity will be added without replacing a training plan." });
  }
  return plans;
}
export function garminImportCounts(plans: PlannedGarminImport[], skipped: number, rejected: number): ImportCounts {
  const counts: ImportCounts = { new: 0, updated: 0, duplicate: 0, skipped, rejected };
  for (const row of plans) counts[row.status]++;
  return counts;
}
export function garminPreviewToken(input: unknown) {
  return createHash("sha256").update(JSON.stringify(input)).digest("hex");
}
