import test from 'node:test';
import assert from 'node:assert/strict';
import { generatePlan } from './science';
import { reviewedTriathlonTemplate } from './triathlon-template';
import { boundPlanWeeks } from './planning-bounds';
import { parsePlanningSetup } from './planning-setup';
import { shapeTrainingCycle } from './training-cycle';

const start = new Date('2026-10-31T12:00:00Z');
const distances = ['sprint', 'olympic', 'half', 'full'];
const levels = ['beginner', 'amateur', 'advanced', 'pro'];

test('every reviewed triathlon distance and level separates each sport into bounded bouts', () => {
  for (const level of levels) for (const distance of distances) for (const weeklyMinutes of [120, 411, 720, 1200]) {
    const raw = generatePlan({ level, distance, weeks: 12, startDate: start, weeklyHours: weeklyMinutes / 60, reviewedCycle: true });
    for (const week of raw) {
      assert.equal(week.templateVersion, 'triathlon-foundation-v3', `${level}/${distance}`);
      assert.ok(week.totalMinutes <= weeklyMinutes, `${level}/${distance}/${weeklyMinutes}`);
      assert.equal(week.totalMinutes, week.sessions.reduce((n, s) => n + s.minutes, 0));
      for (const sport of ['swim', 'bike', 'run']) assert.equal(week.sessions.filter(s => s.sport === sport).length, 2);
      assert.ok(week.sessions.every(s => Number.isInteger(s.minutes) && s.minutes > 0));
      assert.ok(week.sessions.filter(s => s.sport === 'swim').every(s => s.minutes <= 75));
      assert.ok(week.sessions.filter(s => s.sport === 'run').every(s => s.minutes <= 120));
      assert.ok(week.sessions.filter(s => s.sport === 'bike').every(s => s.minutes <= 240));
      assert.ok(week.sessions.filter(s => s.zone === 'z4').length <= 2);
      assert.ok(!week.sessions.some(s => s.sport === 'brick'), 'An ordinary sport allocation is not an ordered multisport workout.');
    }
    assert.ok(raw[5].totalMinutes < raw[4].totalMinutes, 'The existing recovery wave still applies.');
  }
});

test('event distance changes sport distribution within the reported dose, without inventing more capacity', () => {
  const sprint = generatePlan({ level: 'advanced', distance: 'sprint', weeks: 1, startDate: start, weeklyHours: 10, reviewedCycle: true })[0];
  const full = generatePlan({ level: 'advanced', distance: 'full', weeks: 1, startDate: start, weeklyHours: 10, reviewedCycle: true })[0];
  const minutes = (week: typeof sprint, sport: string) => week.sessions.filter(s => s.sport === sport).reduce((n, s) => n + s.minutes, 0);
  assert.ok(minutes(full, 'bike') > minutes(sprint, 'bike'));
  assert.ok(minutes(full, 'run') < minutes(sprint, 'run'));
  assert.ok(sprint.totalMinutes <= 510 && full.totalMinutes <= 510);
  assert.equal(sprint.periodizationFactor, full.periodizationFactor);
  assert.deepEqual(reviewedTriathlonTemplate({ weeks: 1, weeklyHours: 0, volume: () => 1 })[0].sessions, []);
});

test('the reviewed plan obeys actual days, daily/weekly time and performed/event protection at every distance and level', () => {
  for (const level of levels) for (const distance of distances) for (const trainingDays of [[0, 2, 4], [0, 1, 2, 3, 4, 5]]) {
    const setup = parsePlanningSetup({ baselineWeeklyMinutes: 411, maxSessionMinutes: 70, trainingDays });
    const raw = generatePlan({ level, distance, weeks: 8, startDate: start, weeklyHours: 411 / 60, reviewedCycle: true });
    const bounded = boundPlanWeeks(raw, setup, 411 / 60, 6, level, [], { preserveWeeklyDose: true }).weeks;
    const cycle = shapeTrainingCycle(bounded, { startKey: '2026-10-31', needsAssessment: true, recoveryReview: false,
      protectedDays: ['2026-11-01'], events: [{ dateKey: '2026-11-15', priority: 'A' }], templatePeriodized: true });
    for (const [index, week] of cycle.entries()) {
      assert.ok(week.totalMinutes <= Math.min(411, 70 * trainingDays.length));
      assert.ok(week.totalMinutes <= bounded[index].totalMinutes);
      for (const s of week.sessions) {
        assert.ok(trainingDays.includes((6 + s.daySlot) % 7));
        assert.ok(s.minutes <= 70);
        const key = new Date(start.getTime() + (index * 7 + s.daySlot) * 86400000).toISOString().slice(0, 10);
        assert.ok(!['2026-11-01', '2026-11-15'].includes(key));
      }
    }
    // Three or more available days preserve independent sport exposure before
    // performed/event removal; no unagreed double session is invented.
    for (const week of bounded) for (const sport of ['swim', 'bike', 'run']) assert.ok(week.sessions.some(s => s.sport === sport), `${level}/${distance}/${trainingDays.length}/${sport}`);
    assert.ok(bounded.every(w => new Set(w.sessions.map(s => s.daySlot)).size === w.sessions.length));
  }
});
