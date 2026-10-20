import { summarizeSet, type EditableStep, type SetSummary } from "./workout-interval-edit";

/**
 * Revision history of ONE workout, rebuilt from the AuditLog rows that `updateWorkout`, the card step editor and
 * the approval route already write (nothing new is stored for this). Pure: callers load the rows, scoped to the
 * athlete (`subjectId`) and the workout (`entityId`); this module re-checks the workout id and never echoes raw
 * before/after JSON, because a `workout.update` row carries the whole workout (feedback, heart rate, weights…).
 * Only digests of the prescription and short field-level changes leave this module.
 *
 * What it can answer: what changed, when, and whether the athlete's approval still matches the current revision.
 * What it does NOT do: restore. Undo stays the existing "restore" action of /api/workout/card, which only reverts
 * the LATEST step edit and only while that edit is still the current prescription (`canRestoreLatest` mirrors that
 * exact condition so the UI never offers an undo the server will refuse).
 */
export interface AuditRow { id: string; actorId?: string | null; action: string; entityId?: string | null; before?: string | null; after?: string | null; note?: string | null; createdAt: Date | string }
export type HistoryKind = "steps_edited" | "steps_restored" | "approved" | "plan_edited" | "structure_edited" | "other";
export interface StepsDigest extends Partial<Omit<SetSummary, "totalSeconds">> { stepCount: number; totalSeconds: number | null }
export interface HistoryEntry {
  id: string; at: string; kind: HistoryKind; action: string;
  summary: { en: string; es: string };
  /** The edit cleared the athlete's approval (the next send/export needs a fresh approval). */
  approvalCleared: boolean;
  before?: StepsDigest | null; after?: StepsDigest | null;
  /** For approvals: the exact revision the athlete approved. */
  approvedRevision?: string;
  byAthlete: boolean | null;
}

const parse = (text: string | null | undefined): any => { if (typeof text !== "string") return null; try { const v = JSON.parse(text); return v && typeof v === "object" ? v : null; } catch { return null; } };
const iso = (v: Date | string) => (v instanceof Date ? v : new Date(v)).toISOString();
const when = (row: AuditRow) => Date.parse(iso(row.createdAt));

/** Steps of a stored prescription, with repeat nodes expanded. null when there are no explicit steps. */
export function prescriptionSteps(prescription: unknown): EditableStep[] | null {
  const p = typeof prescription === "string" ? parse(prescription) : prescription;
  if (!p || typeof p !== "object") return null;
  const raw = p.sportStructure?.kind === "endurance" && Array.isArray(p.sportStructure.steps) ? p.sportStructure.steps : p.steps;
  if (!Array.isArray(raw) || !raw.length) return null;
  const out: EditableStep[] = [];
  const expand = (nodes: any[], depth = 0): boolean => {
    if (depth > 4) return false;
    for (const node of nodes) {
      if (!node || typeof node !== "object") return false;
      if (node.repeat !== undefined) {
        const n = Number(node.repeat);
        if (!Number.isInteger(n) || n < 1 || n > 100 || !Array.isArray(node.steps)) return false;
        for (let i = 0; i < n; i++) if (!expand(node.steps, depth + 1)) return false;
      } else { out.push(node as EditableStep); if (out.length > 1000) return false; }
    }
    return true;
  };
  return expand(raw) ? out : null;
}

export function stepsDigest(prescription: unknown): StepsDigest | null {
  const steps = prescriptionSteps(prescription);
  if (!steps) return null;
  const timed = steps.every(s => typeof s.seconds === "number" && Number.isFinite(s.seconds));
  const set = timed && steps.every(s => !s.endpoint || (s.endpoint as { type?: string }).type === "time") ? summarizeSet(steps) : null;
  return { stepCount: steps.length, totalSeconds: timed ? steps.reduce((sum, s) => sum + s.seconds, 0) : null, ...(set ?? {}) };
}

const min = (s: number) => `${Math.round(s / 60)} min`;
function describeSteps(before: StepsDigest | null, after: StepsDigest | null): { en: string; es: string } {
  if (!before || !after) return { en: "Workout steps changed.", es: "Cambiaron los pasos del entrenamiento." };
  const en: string[] = [], es: string[] = [];
  if (before.repeats != null && after.repeats != null && before.repeats !== after.repeats) { en.push(`repeats ${before.repeats} → ${after.repeats}`); es.push(`repeticiones ${before.repeats} → ${after.repeats}`); }
  if (before.workSeconds != null && after.workSeconds != null && before.workSeconds !== after.workSeconds) { en.push(`work ${before.workSeconds} s → ${after.workSeconds} s`); es.push(`trabajo ${before.workSeconds} s → ${after.workSeconds} s`); }
  if (before.restSeconds != null && after.restSeconds != null && before.restSeconds !== after.restSeconds) { en.push(`rest ${before.restSeconds} s → ${after.restSeconds} s`); es.push(`descanso ${before.restSeconds} s → ${after.restSeconds} s`); }
  if (before.workZone != null && after.workZone != null && before.workZone !== after.workZone) { en.push(`work zone Z${before.workZone} → Z${after.workZone}`); es.push(`zona de trabajo Z${before.workZone} → Z${after.workZone}`); }
  if (before.totalSeconds != null && after.totalSeconds != null && before.totalSeconds !== after.totalSeconds) { en.push(`total ${min(before.totalSeconds)} → ${min(after.totalSeconds)}`); es.push(`total ${min(before.totalSeconds)} → ${min(after.totalSeconds)}`); }
  if (!en.length) { en.push(`${before.stepCount} → ${after.stepCount} steps`); es.push(`${before.stepCount} → ${after.stepCount} pasos`); }
  return { en: `Steps edited: ${en.join(", ")}.`, es: `Pasos editados: ${es.join(", ")}.` };
}

const PLAN_FIELDS: Record<string, { en: string; es: string }> = {
  title: { en: "title", es: "título" }, durationMin: { en: "duration", es: "duración" }, intensity: { en: "intensity", es: "intensidad" },
  sport: { en: "sport", es: "deporte" }, type: { en: "type", es: "tipo" }, startTime: { en: "start time", es: "hora de inicio" },
  date: { en: "date", es: "fecha" }, indoor: { en: "indoor/outdoor", es: "interior/exterior" }, notes: { en: "notes", es: "notas" },
};
const comparable = (v: unknown) => (v instanceof Date ? v.toISOString() : v == null ? null : typeof v === "object" ? JSON.stringify(v) : v);

export function buildWorkoutHistory(rows: readonly AuditRow[], opts: { workoutId: string; athleteId?: string | null; limit?: number }): HistoryEntry[] {
  const entries: HistoryEntry[] = [];
  for (const row of [...rows].sort((a, b) => when(b) - when(a))) {
    if (row.entityId !== opts.workoutId || !row.action.startsWith("workout.")) continue;
    // Athlete feedback (RPE, notes, measurements) is a report on the session, not a revision of the plan.
    if (row.action === "workout.feedback") continue;
    const base = { id: row.id, at: iso(row.createdAt), action: row.action, byAthlete: opts.athleteId && row.actorId ? row.actorId === opts.athleteId : null };
    if (row.action === "workout.approved") {
      const revision = parse(row.after)?.revision;
      entries.push({ ...base, kind: "approved", approvalCleared: false, approvedRevision: typeof revision === "string" ? revision : undefined, summary: { en: "Approved for sending/export.", es: "Aprobado para envío/exportación." } });
    } else if (row.action === "workout.cardSteps" || row.action === "workout.cardRestore") {
      const before = stepsDigest(row.before), after = stepsDigest(row.after);
      const restored = row.action === "workout.cardRestore";
      const d = describeSteps(before, after);
      entries.push({ ...base, kind: restored ? "steps_restored" : "steps_edited", approvalCleared: true, before, after,
        summary: restored ? { en: `Previous steps restored. ${d.en}`, es: `Se restauraron los pasos anteriores. ${d.es}` } : d });
    } else if (row.action === "workout.update") {
      const before = parse(row.before), after = parse(row.after);
      if (!before || !after) continue;
      const changed = Object.keys(PLAN_FIELDS).filter(k => comparable(before[k]) !== comparable(after[k]));
      if (!changed.length) continue; // feedback-only or no-op update: not a plan revision
      const prescriptionChanged = comparable(before.prescription) !== comparable(after.prescription);
      entries.push({ ...base, kind: "plan_edited", approvalCleared: before.approved === true && after.approved === false,
        ...(prescriptionChanged ? { before: stepsDigest(before.prescription), after: stepsDigest(after.prescription) } : {}),
        summary: { en: `Plan edited: ${changed.map(k => PLAN_FIELDS[k].en).join(", ")}.`, es: `Plan editado: ${changed.map(k => PLAN_FIELDS[k].es).join(", ")}.` } });
    } else if (row.action === "workout.sportStructure") {
      entries.push({ ...base, kind: "structure_edited", approvalCleared: true, before: stepsDigest(row.before), after: stepsDigest(row.after), summary: { en: "Sport structure edited.", es: "Estructura deportiva editada." } });
    } else {
      entries.push({ ...base, kind: "other", approvalCleared: false, summary: { en: `Recorded change (${row.action}).`, es: `Cambio registrado (${row.action}).` } });
    }
  }
  return entries.slice(0, Math.max(1, Math.min(opts.limit ?? 50, 200)));
}

/** Is the athlete's latest approval for exactly the revision that is current now? */
export function approvalStatus(rows: readonly AuditRow[], opts: { workoutId: string; currentRevision: string }): { approved: boolean; approvedAt: string | null; reason: "current" | "never_approved" | "revision_changed" } {
  const approvals = rows.filter(r => r.action === "workout.approved" && r.entityId === opts.workoutId).sort((a, b) => when(b) - when(a));
  const latest = approvals[0];
  if (!latest) return { approved: false, approvedAt: null, reason: "never_approved" };
  const revision = parse(latest.after)?.revision;
  return revision === opts.currentRevision ? { approved: true, approvedAt: iso(latest.createdAt), reason: "current" } : { approved: false, approvedAt: iso(latest.createdAt), reason: "revision_changed" };
}

/** Mirrors /api/workout/card restore: the newest step edit must have produced the prescription that is saved now. */
export function canRestoreLatest(rows: readonly AuditRow[], opts: { workoutId: string; currentPrescription: string | null }): boolean {
  const newest = [...rows].filter(r => r.entityId === opts.workoutId && r.action === "workout.cardSteps").sort((a, b) => when(b) - when(a))[0];
  return Boolean(newest?.before && newest.after != null && newest.after === opts.currentPrescription);
}
