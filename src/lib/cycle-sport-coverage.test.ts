import test from 'node:test';
import assert from 'node:assert/strict';
import { assessCycleSportCoverage, type CoverageWeek } from './cycle-sport-coverage';
import { generatePlan, generateHyroxPlan } from './science';
import { boundPlanWeeks } from './planning-bounds';
import { parsePlanningSetup } from './planning-setup';
import { shapeTrainingCycle } from './training-cycle';

const session = (sport: string) => ({ sport, minutes: 30 });
const week = (number: number, sports: string[], extra: Partial<CoverageWeek> = {}): CoverageWeek => ({ week: number, sessions: sports.map(session), ...extra });
test('persistent missing triathlon sports block a complete-cycle claim without treating occasional missing work as permanent', () => {
  const partial = assessCycleSportCoverage('full', [week(1, ['swim', 'bike']), week(2, ['swim', 'bike'])]);
  assert.equal(partial.status, 'incomplete'); assert.equal(partial.canSaveCompleteCycle, false);
  assert.deepEqual(partial.persistentMissingComponents, ['run']); assert.match(partial.message, /no running/);
  assert.match(partial.messageEs, /carrera/);
  const intermittent = assessCycleSportCoverage('full', [week(1, ['swim', 'bike']), week(2, ['swim', 'bike', 'run'])]);
  assert.equal(intermittent.status, 'incomplete'); assert.equal(intermittent.canSaveCompleteCycle, true);
  assert.deepEqual(intermittent.incompleteWeeks, [1]); assert.deepEqual(intermittent.persistentMissingComponents, []);
});

test('event, performed and additional recovery constraints are explicit exclusions rather than prose-derived missing-sport failures', () => {
  const input = [week(1, [], { eventIds: ['race'] }), week(2, [], { eventDays: ['2026-11-15'] }),
    week(3, [], { volumeDecision: { protectedDates: ['2026-11-21'] } }), week(4, [], { cycleFactor: .6 }), week(5, ['swim', 'bike', 'run'])];
  const before = JSON.stringify(input), coverage = assessCycleSportCoverage('olympic', input);
  assert.equal(coverage.status, 'covered'); assert.deepEqual(coverage.excludedWeeks, [1, 2, 3, 4]); assert.deepEqual(coverage.routineWeeks, [5]);
  assert.equal(JSON.stringify(input), before);
  const unknown = assessCycleSportCoverage('olympic', input.slice(0, 4));
  assert.equal(unknown.status, 'unassessed'); assert.deepEqual(unknown.persistentMissingComponents, []);
  assert.match(unknown.message, /cannot be assessed/);
  const stillCovered = assessCycleSportCoverage('olympic', [week(1, ['swim', 'bike', 'run'], { volumeDecision: { protectedDates: ['2026-11-21'] } })]);
  assert.equal(stillCovered.status, 'covered'); assert.deepEqual(stillCovered.excludedWeeks, []);
  const everyWeekProtected = [week(1, ['swim'], { volumeDecision: { protectedDates: ['2026-11-21'] } }), week(2, ['swim'], { eventIds: ['event'] })];
  const badSchedule = assessCycleSportCoverage('olympic', everyWeekProtected, [week(1, ['swim', 'bike']), week(2, ['swim', 'bike'])]);
  assert.equal(badSchedule.canSaveCompleteCycle, false); assert.deepEqual(badSchedule.persistentMissingComponents, ['run']);
  assert.ok(badSchedule.planningBasisWeeks.every(w => w.basis === 'before_context_reductions'));
  const genuineRemoval = assessCycleSportCoverage('olympic', everyWeekProtected, [week(1, ['swim', 'bike', 'run']), week(2, ['swim', 'bike', 'run'])]);
  assert.equal(genuineRemoval.status, 'unassessed'); assert.equal(genuineRemoval.canSaveCompleteCycle, true);
});

test('HYROX station coverage accepts explicit station or strength sessions without inventing a race simulation', () => {
  assert.equal(assessCycleSportCoverage('hyrox', [week(1, ['run', 'strength']), week(2, ['run', 'hyrox'])]).status, 'covered');
  const runOnly = assessCycleSportCoverage('hyrox', [week(1, ['run']), week(2, ['run'])]);
  assert.equal(runOnly.canSaveCompleteCycle, false); assert.deepEqual(runOnly.persistentMissingComponents, ['station-practice']);
  const invalidDose = assessCycleSportCoverage('cycle', [{ week: 1, sessions: [{ sport: 'bike', minutes: NaN }, { sport: 'bike', minutes: 0 }] }]);
  assert.equal(invalidDose.canSaveCompleteCycle, false);
  assert.throws(() => assessCycleSportCoverage('unsupported', []), /Unsupported/);
});

test('real bounded generator output exposes unavailable triathlon legs and HYROX station work before saving', () => {
  const startKey = '2026-11-02', start = new Date(`${startKey}T12:00Z`);
  for (const days of [[0], [0, 6], [0, 2, 4]]) {
    const setup = parsePlanningSetup({ baselineWeeklyMinutes: 180, maxSessionMinutes: 60, trainingDays: days });
    const raw = generatePlan({ level: 'amateur', distance: 'olympic', weeks: 6, startDate: start, weeklyHours: 3, reviewedCycle: true });
    const shaped = shapeTrainingCycle(boundPlanWeeks(raw, setup, 3, 1, 'amateur', [], { preserveWeeklyDose: true }).weeks,
      { startKey, needsAssessment: true, recoveryReview: false, protectedDays: [], templatePeriodized: true });
    const coverage = assessCycleSportCoverage('olympic', shaped);
    assert.equal(coverage.canSaveCompleteCycle, days.length >= 3);
    if (days.length < 3) assert.ok(coverage.persistentMissingComponents.includes('run'));
  }
  const setup = parsePlanningSetup({ baselineWeeklyMinutes: 180, maxSessionMinutes: 60, trainingDays: [0] });
  const hyrox = generateHyroxPlan({ level: 'amateur', weeks: 6, startDate: start, weeklyHours: 3, reviewedCycle: true });
  const bounded = boundPlanWeeks(hyrox, setup, 3, 1, 'amateur', [], { preserveWeeklyDose: true }).weeks;
  assert.deepEqual(assessCycleSportCoverage('hyrox', bounded).persistentMissingComponents, ['station-practice']);
});
