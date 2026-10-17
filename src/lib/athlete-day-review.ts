import { dateKey } from './dates';
import { hasPerformedTraining } from './j-metrics';
import { groupActivityEvidence, type ActivityDecision, type ActivityEvidenceRow } from './activity-evidence';
import type { PlanningSetup } from './planning-setup';
import { readSessionObservations } from './session-observations';
const bounded = (n: unknown, min: number, max: number): number | null => typeof n === 'number' && Number.isFinite(n) && n >= min && n <= max ? n : null;
/** Owner/day-scoped observations only. Never sum unresolved copies or infer tolerance. */
interface ReviewActivity extends ActivityEvidenceRow { id: string; sport: string; title: string; userId: string; completed: boolean; [key: string]: any }
export function athleteDayReview(rows: ReviewActivity[], athleteId: string, day: string, timezone: string, setup: PlanningSetup | null, decisions: readonly ActivityDecision[] = []) {
  const actual = rows.filter(row => row.userId === athleteId && Number.isFinite(new Date(row.date).getTime()) && dateKey(new Date(row.date), timezone) === day && hasPerformedTraining(row));
  const reconciliation = groupActivityEvidence(actual, decisions);
  return {
    baselineWeeklyMinutes: bounded(setup?.baselineWeeklyMinutes, 0, 2400), baselineObservedAt: setup?.baselineObservedAt ?? null,
    rawRecordCount: actual.length, possibleCopies: reconciliation.unresolvedGroups,
    records: actual.slice(0, 50).map(row => {
      const minutes = bounded(row.actualDurationMin ?? (!row.planned ? row.durationMin : null), 0, 1440);
      let reportedDistance: unknown = row.distanceKm;
      if (row.planned) {
        reportedDistance = null;
        try { const details=JSON.parse(row.actualDetails || 'null'); if(details?.schemaVersion===1) reportedDistance=details.values?.distanceKm; } catch { /* Unknown actual distance stays unknown. */ }
      }
      const distanceKm = bounded(reportedDistance, .001, 1500);
      const observations = readSessionObservations(row);
      return { id: row.id, title: row.title, sport: row.actualSport || row.sport, source: row.source ?? 'unknown', feedbackRevision: row.feedbackRevision ?? null,
        minutes, rpe: bounded(row.rpe, 0, 10), distanceKm,
        paceSecondsPerKm: minutes !== null && minutes > 0 && distanceKm !== null ? minutes * 60 / distanceKm : null,
        ...observations, actualDetails: row.actualDetails ?? null, feedbackStatus: row.feedbackStatus ?? null,
        feedbackNote: row.feedbackNote ?? null, matchedPlanId: row.matchedPlanId ?? null, actualSport: row.actualSport ?? null,
      };
    }),
  };
}
export type AthleteDayReview = ReturnType<typeof athleteDayReview>;
