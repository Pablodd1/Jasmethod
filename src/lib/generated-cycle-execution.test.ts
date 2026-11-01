import test from 'node:test';
import assert from 'node:assert/strict';
import { generatePlan, generateHyroxPlan, generateSingleSport, generateTrackSprint } from './science';
import { boundPlanWeeks } from './planning-bounds';
import { parsePlanningSetup } from './planning-setup';
import { shapeTrainingCycle } from './training-cycle';
import { buildCycleBaselineReviews, requiredCycleSports } from './cycle-review';
import { evidencedTargetProfile } from './anchor-evidence';
import { prescribeToday } from './adaptive';
import { canonicalSession } from './canonical-session';
import { addDaysKey, localDate } from './dates';

const startKey = '2026-10-31', start = new Date(`${startKey}T12:00:00Z`);
const tests = [
  { id: 'ftp', type: 'ftp', result: 200, date: new Date('2026-10-30T12:00Z'), completed: true, skipped: false },
  { id: 'run', type: 'run5k', result: 1500, date: new Date('2026-10-30T12:00Z'), completed: true, skipped: false },
  { id: 'swim', type: 'swim', result: 100, date: new Date('2026-10-30T12:00Z'), completed: true, skipped: false },
];
const rawProfile = { ftp: 200, runPaceBase: 318, swimPaceBase: 100 };
const ids = tests.map(t => t.id);
const levels = ['beginner', 'amateur', 'advanced', 'pro'];
const goals = ['sprint', 'olympic', 'half', 'full', 'run-only', 'cycle', 'swim-only', 'hyrox', 'track-sprint'];
function generated(goal: string, level: string, weeklyMinutes: number) {
  const opts = { level, weeks: 16, startDate: start, weeklyHours: weeklyMinutes / 60, reviewedCycle: true };
  return goal === 'hyrox' ? generateHyroxPlan(opts)
    : goal === 'track-sprint' ? generateTrackSprint({ ...opts, event: '400m' })
      : ['run-only', 'cycle', 'swim-only'].includes(goal)
        ? generateSingleSport({ ...opts, sport: goal === 'cycle' ? 'bike' : goal === 'swim-only' ? 'swim' : 'run' })
        : generatePlan({ ...opts, distance: goal });
}

test('every supported generated cycle resolves complete canonical steps with current dated anchors or honest effort fallback', () => {
  for (const level of levels) for (const goal of goals) for (const weeklyMinutes of [120, 720]) for (const hasAnchors of [false, true]) {
    const profile = hasAnchors ? rawProfile : {}, benchmarks = hasAnchors ? tests : [], appliedIds = hasAnchors ? ids : [];
    const raw = generated(goal, level, weeklyMinutes);
    if (goal === 'swim-only') assert.ok(raw.every(w => w.sessions.filter(s => s.sport === 'swim').every(s => s.minutes <= 75)));
    const setup = parsePlanningSetup({ trainingDays: [0, 1, 2, 3, 4, 5, 6], maxSessionMinutes: 180, baselineWeeklyMinutes: weeklyMinutes });
    const baselineReviews = buildCycleBaselineReviews({ profile, tests: benchmarks, appliedIds, sports: requiredCycleSports(goal), now: start });
    const weeks = shapeTrainingCycle(boundPlanWeeks(raw, setup, weeklyMinutes / 60, 6, level, [], { preserveWeeklyDose: true }).weeks,
      { startKey, needsAssessment: !hasAnchors, recoveryReview: false, protectedDays: [], templatePeriodized: true, baselineReviews });
    if (goal === 'track-sprint' && level === 'beginner') {
      assert.ok(raw.every(w => /coach assessment required/.test(w.theme)));
      assert.ok(weeks.every(w => !w.sessions.length && w.totalMinutes === 0), 'A novice must not inherit maximal sprint training from an endurance anchor.');
      continue;
    }
    for (const [wi, week] of weeks.entries()) {
      assert.ok(week.sessions.length > 0, `${goal}/${level}/week${wi + 1}`);
      assert.ok(week.totalMinutes <= weeklyMinutes);
      for (const session of week.sessions) {
        const key = addDaysKey(startKey, wi * 7 + session.daySlot), date = localDate(key, 'UTC');
        // Projection resolves on the actual session date; a current reference
        // cannot silently remain current through a 16-week calendar.
        const anchors = evidencedTargetProfile(profile, benchmarks, appliedIds, date);
        const workout = { id: `${goal}-${wi}-${session.daySlot}`, userId: 'synthetic', sport: session.sport, title: session.title, type: session.type, intensity: session.zone, durationMin: session.minutes };
        const prescription = prescribeToday({ session: { ...workout, description: session.description, cycleVersion: 'bounded-cycle-v1' }, adaptation: { verdict: 'planned', durationFactor: 1, intensityCap: session.zone } });
        const c = canonicalSession({ athleteId: 'synthetic', workout, profile: anchors, prescription, dateLocal: key, timezone: 'UTC' });
        const label = `${goal}/${level}/${weeklyMinutes}/${hasAnchors}/${key}/${session.title}`;
        assert.equal(c.verdict, 'ready', `${label}: ${c.reason}`);
        assert.equal(c.exactTimeSeconds, session.minutes * 60, label);
        assert.ok(c.steps.length > 0 && c.steps.every(s => s.seconds > 0), label);
        assert.ok(c.steps.every(s => Number(s.zone.slice(1)) <= Number(session.zone.slice(1))), label);
        if (!hasAnchors || wi >= 13) assert.ok(c.steps.every(s => s.target.type === 'open'), label);
      }
    }
  }
});

test('a structured planned preview is not evidence of session-day permission or device delivery', () => {
  const session = { id: 'synthetic', sport: 'bike', title: 'Current structured ride', type: 'endurance', intensity: 'z2', durationMin: 30 };
  const prescription = prescribeToday({ session, adaptation: { verdict: 'planned', durationFactor: 1, intensityCap: 'z2' } });
  const held = canonicalSession({ athleteId: 'synthetic', workout: session, prescription, dateLocal: startKey, timezone: 'UTC',
    safety: { status: 'unknown', reason: 'Current session-day safety and time have not been confirmed.' } });
  assert.equal(held.verdict, 'blocked');
  assert.equal(held.capability.available, false);
  assert.deepEqual(held.steps, []);
});
