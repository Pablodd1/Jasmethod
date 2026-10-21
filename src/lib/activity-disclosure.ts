import { provenanceOf, type ProvenanceFields } from './strava-provenance';
export const ACTIVITY_DISCLOSURE_REASON = 'Restricted or unknown provider records are available only in the athlete\'s own view. Role access does not grant provider disclosure permission; unavailable history is not zero training.';
export function activityDisclosure<T extends ProvenanceFields>(rows: readonly T[], actorId: string, athleteId: string) {
  const owner = actorId === athleteId;
  const limited = !owner && rows.some(row => provenanceOf(row) !== 'allowed');
  return { records: owner ? [...rows] : rows.filter(row => provenanceOf(row) === 'allowed'), limited, reason: limited ? ACTIVITY_DISCLOSURE_REASON : null };
}
/** Serialized audit payloads have no reliable field-level provenance. Do not
 * disclose free-form snapshots to another person, even outside the workout window. */
export function activityAuditDisclosure<T extends { id: string; action: string; createdAt: Date; actor?: { name: string | null } | null }>(rows: readonly T[], actorId: string, athleteId: string) {
  return actorId === athleteId ? { records: [...rows], reason: null } : {
    records: rows.map(row => ({ id: row.id, action: row.action, createdAt: row.createdAt, actor: row.actor ? { name: row.actor.name } : null, entityId: null, before: null, after: null })),
    reason: 'Audit snapshots are unavailable to another person because their free-form payloads may contain restricted provider records.',
  };
}
/** Daily contexts may retain raw observations even when numerical use is held. */
export function trainingViewDisclosureAllowed(actorId: string, athleteId: string, rows: readonly ProvenanceFields[], context?: unknown): boolean {
  if (actorId === athleteId) return true;
  if (rows.some(row => provenanceOf(row) !== 'allowed')) return false;
  if (!context || typeof context !== 'object') return true;
  const value = context as Record<string, any>;
  for (const metric of Object.values(value.metrics || {}) as any[]) {
    for (const candidate of [metric?.selected, metric?.latest, ...(metric?.conflicts || []), ...(metric?.observations || [])])
      if (candidate && candidate.aiEligibility !== 'allowed') return false;
  }
  return !(value.completedWorkouts || []).some((session: any) => (session.sourceRecords || []).some((row: any) => row.aiEligibility !== 'allowed'));
}
