type Candidate = { id: string; matchedPlanId?: string | null };
export type TodayFeedbackTarget = { kind: 'session' | 'record'; id: string } | { kind: 'choose' | 'none' };

/** A planned row linked to an imported activity points to that activity's id.
 * Never guess when the link cannot be resolved or other records need review. */
export function todayFeedbackTarget(session: Candidate | null | undefined, records: readonly Candidate[]): TodayFeedbackTarget {
  if (session?.matchedPlanId) {
    const linked = records.filter(record => record.id === session.matchedPlanId && !record.matchedPlanId);
    if (linked.length === 1) return { kind: 'record', id: linked[0].id };
    return records.length ? { kind: 'choose' } : { kind: 'none' };
  }
  if (records.length) return { kind: 'choose' };
  return session ? { kind: 'session', id: session.id } : { kind: 'none' };
}
