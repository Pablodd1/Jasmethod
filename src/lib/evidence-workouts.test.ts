import test from 'node:test';
import assert from 'node:assert/strict';
import { EVIDENCE_WORKOUTS, evidenceWorkoutSeconds, buildEvidenceWorkout } from './evidence-workouts';
import { buildProtocol, PROTOCOL_VERSION, type ProtocolId } from './protocols';
import { protocolEvidence } from './reviewed-evidence';
import { reviewProtocolAthlete } from './protocol-eligibility';
import { prescribeToday } from './adaptive';
import { checkinPrescriptionInputError } from './checkin-prescription-input';
const spec = (id = 'running-10-20-30', sport: 'run' | 'bike' = 'run') => ({ id: id as ProtocolId, sport, minutes: 60, level: 'advanced', version: PROTOCOL_VERSION, familiarityReviewed: true });

test('reviewed main sets preserve exact intra-block and between-block recoveries', () => {
  const running = buildProtocol(spec());
  assert.equal(running.durationMin, 34);
  assert.equal(running.steps.filter(s => s.phase === 'active').length, 45);
  assert.deepEqual(running.steps.filter(s => s.phase === 'recovery').map(s => s.seconds), [120, 120]);
  assert.deepEqual(running.steps.slice(1, 4).map(s => s.seconds), [30, 20, 10]);
  const bike = buildProtocol(spec('cycling-60-75', 'bike'));
  assert.equal(bike.durationMin, 32);
  assert.deepEqual(bike.steps.filter(s => s.phase === 'active').map(s => s.seconds), Array(8).fill(60));
  assert.deepEqual(bike.steps.filter(s => s.phase === 'recovery').map(s => s.seconds), Array(7).fill(75));
  assert.equal(bike.steps.at(-1)!.seconds, 315);
  assert.match(bike.steps.at(-1)!.note!, /15 s/);
});

test('all reviewed protocols keep complete dose and expose coaching choices without fabricated targets', () => {
  for (const w of EVIDENCE_WORKOUTS) {
    const minutes = Math.ceil(evidenceWorkoutSeconds(w) / 60);
    const steps = buildEvidenceWorkout(w, minutes);
    assert.equal(steps.reduce((sum, s) => sum + s.seconds, 0), minutes * 60);
    assert.ok(steps.every(s => s.seconds > 0 && s.target?.type === 'open'));
    assert.ok(steps.every(s => s.endpoint?.type === 'time' && s.endpoint.seconds === s.seconds));
    assert.throws(() => buildEvidenceWorkout(w, minutes - .01), /at least/);
    assert.throws(() => buildEvidenceWorkout(w, NaN), /at least/);
    const evidence = protocolEvidence(w.id);
    assert.equal(evidence.doseOrigin, 'reviewed_main_set_jmm_effort_adaptation');
    assert.match(evidence.limitation, /JMM/);
    assert.equal(evidence.claims[0].numericAuthority, 'reviewed_work_rest_only');
    assert.ok(evidence.claims[0].sourceUrl.startsWith('https://'));
  }
});

test('advanced experience and explicit prior tolerance are required independently', () => {
  for (const level of ['beginner', 'amateur', '', 'unknown']) assert.throws(() => buildProtocol({ ...spec(), level }), /advanced/);
  assert.throws(() => buildProtocol({ ...spec(), familiarityReviewed: undefined }), /prior tolerance/);
  assert.throws(() => buildProtocol({ ...spec(), sport: 'bike' }), /supported/);
  const athlete = { protocolId: spec().id, birthYear: 1990, injured: false, experience: 'advanced', goal: '5k', now: new Date('2026-10-11') };
  assert.equal(reviewProtocolAthlete(athlete).status, 'eligible');
  assert.equal(reviewProtocolAthlete({ ...athlete, experience: 'amateur' }).status, 'blocked');
  assert.equal(reviewProtocolAthlete({ ...athlete, injured: true }).status, 'blocked');
  assert.equal(reviewProtocolAthlete({ ...athlete, birthYear: undefined }).status, 'insufficient-data');
  const p = buildProtocol(spec());
  assert.match(checkinPrescriptionInputError({ originalPlan: JSON.stringify({ ...p, protocol: { ...p.protocol, familiarityReviewed: false } }) })!, /familiarity/);
});

test('reduced readiness, zone cap and inadequate time pause full-dose interval recipes', () => {
  const p = buildProtocol(spec());
  for (const adaptation of [
    { verdict: 'trim', durationFactor: 1, intensityCap: 'z7' },
    { verdict: 'easy', durationFactor: 1, intensityCap: 'z7' },
    { verdict: 'full', durationFactor: 1, intensityCap: 'z4' },
  ]) {
    const reduced = prescribeToday({ session: p, adaptation });
    assert.equal(reduced.protocol, undefined);
    assert.equal(reduced.intensity, 'z1');
  }
  const full = { verdict: 'full', durationFactor: 1, intensityCap: 'z7' };
  assert.equal(prescribeToday({ session: p, adaptation: full, timeBudgetMin: 33 }).protocol, undefined);
  assert.deepEqual(prescribeToday({ session: p, adaptation: full, timeBudgetMin: 34 }).steps, p.steps);
  assert.equal(prescribeToday({ session: p, adaptation: { verdict: 'rest', durationFactor: 0, intensityCap: 'z1' } }).durationMin, 0);
});

test('reviewed intervals cannot upgrade easy training or enter the conservative taper window', async () => {
  const { reviewProtocolSchedule } = await import('./protocol-scheduling');
  const selected = { id: 'selected', sport: 'run', intensity: 'z2', durationMin: 45, date: new Date('2026-10-20T12:00Z') };
  const opts = { selected, candidate: { ...selected, intensity: 'z5', durationMin: 34 }, nearby: [], timezone: 'UTC', level: 'advanced', protocolId: spec().id };
  assert.ok(reviewProtocolSchedule(opts).blocks.some(b => b.includes('cannot upgrade')));
  assert.equal(reviewProtocolSchedule({ ...opts, selected: { ...selected, intensity: 'z5' } }).blocks.length, 0);
  assert.ok(reviewProtocolSchedule({ ...opts, selected: { ...selected, intensity: 'z5' }, nextRace: new Date('2026-10-25T12:00Z') }).blocks.some(b => b.includes('14 days')));
});

test('unchanged legacy recipes retain their saved version; new recipes require current provenance', () => {
  assert.doesNotThrow(() => buildProtocol({ ...spec(), id: 'aerobic-base', version: '2026-10-07' }));
  assert.throws(() => buildProtocol({ ...spec(), version: '2026-10-07' }), /needs review/);
});

test('Seiler 4 × 8 preserves verified work/recovery and separately labeled cooldown', () => {
  const p = buildProtocol(spec('cycling-4x8', 'bike'));
  assert.equal(p.durationMin, 58);
  assert.deepEqual(p.steps.filter(s => s.phase === 'active').map(s => s.seconds), [480, 480, 480, 480]);
  assert.deepEqual(p.steps.filter(s => s.phase === 'recovery').map(s => s.seconds), [120, 120, 120]);
  assert.equal(p.steps[0].seconds, 900);
  assert.equal(p.steps.at(-1)!.seconds, 300);
  assert.throws(() => buildProtocol(spec('cycling-4x8', 'bike'), 57), /at least 58/);
});

test('all new recipes round-trip through canonical FIT without dropping recoveries or inventing targets', async () => {
  const { Decoder, Stream } = await import('@garmin/fitsdk');
  const { buildFitWorkout, workoutToFitSpec } = await import('./fit-export');
  for (const recipe of EVIDENCE_WORKOUTS) {
    const p = buildProtocol(spec(recipe.id, recipe.sport));
    const canonical = workoutToFitSpec({ ...p, prescription: JSON.stringify(p), ftp: 300, runPaceBase: 280, lthr: 170 });
    assert.equal(canonical.verdict, 'ready');
    assert.equal(canonical.steps.length, p.steps.length);
    const decoder = new Decoder(Stream.fromByteArray(buildFitWorkout(canonical)));
    assert.equal(decoder.checkIntegrity(), true);
    const { messages, errors } = decoder.read();
    assert.deepEqual(errors, []);
    const steps = (messages as any).workoutStepMesgs;
    assert.deepEqual(steps.map((s: any) => s.durationTime), p.steps.map(s => s.seconds));
    assert.equal(steps.reduce((n: number, s: any) => n + s.durationTime, 0), p.durationMin * 60);
    assert.ok(steps.every((s: any) => s.targetType === 'open'));
  }
});

test('effective prescription rechecks athlete eligibility and cannot reuse an unconfirmed recipe', async () => {
  const { effectiveSessionFromRecords } = await import('./effective-prescription');
  const p = { ...buildProtocol(spec()), verdict: 'full' };
  const now = new Date('2026-10-11T12:00Z');
  const records = {
    planning: { ready: true, missing: [], review: [], ruleId: 'fixture' }, userId: 'fixture', timezone: 'UTC', now,
    workout: { ...p, id: 'reviewed-fixture', userId: 'fixture', date: now, originalPlan: JSON.stringify(p), prescription: JSON.stringify(p) },
    profile: { birthYear: 1990, injured: false, experience: 'advanced', goal: '5k' },
    checkin: { date: now, answers: JSON.stringify({ sleep: 3, soreness: 3, motivation: 3, energy: 3, stress: 3, sick: false, newPain: false, urgentSymptoms: false, availableMin: 60 }), adaptation: JSON.stringify({ verdict: 'full', intensityCap: 'z7', durationFactor: 1 }) },
  };
  assert.equal(effectiveSessionFromRecords(records).canonical.verdict, 'ready');
  assert.equal(effectiveSessionFromRecords({ ...records, profile: { ...records.profile, experience: 'beginner' } }).canonical.verdict, 'blocked');
  const unconfirmed = { ...p, protocol: { ...p.protocol, familiarityReviewed: false } };
  assert.equal(effectiveSessionFromRecords({ ...records, workout: { ...records.workout, prescription: JSON.stringify(unconfirmed) } }).canonical.verdict, 'blocked');
});

test('retained protocol labels cannot bless changed stored recoveries or added numerical targets', async () => {
  const { reviewedWorkoutStructureCurrent } = await import('./evidence-workouts');
  const p = buildProtocol(spec());
  assert.equal(reviewedWorkoutStructureCurrent(p), true);
  for (const mutation of [
    { ...p, steps: p.steps.slice(1) },
    { ...p, durationMin: p.durationMin + 1 },
    { ...p, steps: p.steps.map((s, i) => i === 1 ? { ...s, seconds: 29 } : s) },
    { ...p, steps: p.steps.map((s, i) => i === 1 ? { ...s, target: { type: 'power', low: 200, high: 250 } } : s) },
  ]) assert.equal(reviewedWorkoutStructureCurrent(mutation), false);
});
