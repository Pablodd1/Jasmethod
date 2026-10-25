import { addDaysKey, dateKey } from "./dates";
import { groupActivityEvidence, type ActivityDecision, type ActivityEvidenceRow } from "./activity-evidence";
import { derivedActivityPolicy } from "./derived-activity-policy";
import { hasPerformedTraining } from "./j-metrics";

export function trainingWeekBounds(today: string) {
  const weekday = new Date(`${today}T12:00:00Z`).getUTCDay();
  const start = addDaysKey(today, -((weekday + 6) % 7));
  return { start, end: addDaysKey(start, 6), until: addDaysKey(start, 7) };
}
interface WeekRow extends ActivityEvidenceRow {
  id: string; userId: string; title: string; completed: boolean;
  planDay?: { planId: string } | null;
}
/** Local presentation only. No new dose/readiness score or external AI context.
 * Planned minutes never become actual minutes; absent history is not rest. */
export function buildTrainingWeekReview(rows: readonly WeekRow[], userId: string, today: string, timezone: string, activePlanId: string | null, decisions: readonly ActivityDecision[] = [], truncated = false) {
  const bounds = trainingWeekBounds(today);
  const owned = rows.filter(row => row.userId === userId && Number.isFinite(new Date(row.date).getTime()))
    .map(row => ({ ...row, localDay: dateKey(new Date(row.date), timezone) }))
    .filter(row => row.localDay >= bounds.start && row.localDay <= bounds.end);
  const actual = owned.filter(row => row.localDay < today && hasPerformedTraining(row));
  const policy = derivedActivityPolicy(actual);
  const reconciled = policy.status === "allowed" ? groupActivityEvidence(actual, decisions) : null;
  // Duplicate provider identifiers require review even when they were not linked.
  const sourceIds = actual.filter(row => row.source && row.externalId).map(row => JSON.stringify([row.source, row.externalId]));
  const repeated = new Set(sourceIds).size !== sourceIds.length;
  const review = truncated || repeated || !!reconciled?.unresolvedGroups || !!reconciled?.groups.some(group => group.budgetMinutes === null);
  const known = policy.status === "allowed" && !review && !!actual.length;
  const ahead = owned.filter(row => row.localDay > today && row.planned && !hasPerformedTraining(row) && row.feedbackStatus !== "skipped" && row.planDay?.planId === activePlanId && activePlanId !== null);
  const validAhead = ahead.every(row => typeof row.durationMin === "number" && Number.isFinite(row.durationMin) && row.durationMin >= 0 && row.durationMin <= 1440);
  return {
    start: bounds.start, end: bounds.end, today, coverage: "recorded_only" as const,
    past: { status: policy.status !== "allowed" ? "restricted" as const : review ? "review" as const : actual.length ? "available" as const : "unknown" as const,
      sessions: known ? reconciled!.groups.length : null,
      minutes: known ? reconciled!.groups.reduce((sum, group) => sum + group.budgetMinutes!, 0) : null },
    ahead: { sessions: truncated || !activePlanId ? null : ahead.length, minutes: truncated || !activePlanId || !validAhead ? null : ahead.reduce((sum, row) => sum + row.durationMin!, 0),
      next: truncated || !activePlanId ? null : [...ahead].sort((a,b) => a.localDay.localeCompare(b.localDay) || a.id.localeCompare(b.id)).slice(0,3).map(row => ({ id: row.id, date: row.localDay, title: row.title, minutes: row.durationMin ?? null })) },
    usage: "local_display_only" as const,
  };
}
export type TrainingWeekReview = ReturnType<typeof buildTrainingWeekReview>;
