import test from 'node:test';
import assert from 'node:assert/strict';
import {
  evaluateRaceRecords, partitionByAthlete, RACE_EVALUATION_VERSION,
  rollingOriginTrainingEligibility, validateFrozenRaceRecord,
  type FrozenRaceRecord, type RaceEvaluationOptions, type RaceEvaluationOutcome,
} from './race-evaluation';

// Fabricated arithmetic fixtures, never athlete records or evidence of predictive validity.
const options: RaceEvaluationOptions = {
  dataKind: 'synthetic', modelVersion: 'synthetic-model-v1', cohortId: 'synthetic-road-test', timeBasis: 'chip_elapsed',
};
function record(id = '1', patch: Partial<FrozenRaceRecord> = {}): FrozenRaceRecord {
  return {
    schemaVersion: RACE_EVALUATION_VERSION, recordId: `record-${id}`, snapshotId: `snapshot-${id}`,
    inputRevision: `inputs-${id}`, modelVersion: options.modelVersion, timeBasis: options.timeBasis,
    athleteId: `synthetic-athlete-${id}`, eventId: 'synthetic-edition-1', cohortId: options.cohortId,
    eventStartAt: '2026-05-10T08:00:00Z', cutoffAt: '2026-05-09T08:00:00Z', frozenAt: '2026-05-09T07:00:00Z',
    evidence: [{ id: `synthetic-inputs-${id}`, availableAt: '2026-05-08T08:00:00Z' }],
    estimatedElapsedSeconds: 3600, abstentionReason: null, ...patch,
  };
}
function result(input: FrozenRaceRecord, patch: Partial<RaceEvaluationOutcome> = {}): RaceEvaluationOutcome {
  return {
    athleteId: input.athleteId, eventId: input.eventId, status: 'finished', elapsedSeconds: 3600,
    timeBasis: options.timeBasis, sourceId: 'synthetic-results-v1', availableAt: '2026-05-11T08:00:00Z', ...patch,
  };
}
function report(input: FrozenRaceRecord, patch: Partial<RaceEvaluationOutcome> = {}) {
  return evaluateRaceRecords([input], [result(input, patch)], options);
}

test('synthetic fixtures calculate signed bias, MAE, median APE and tail error with an explicit limitation', () => {
  const records = [90, 220, 270, 440].map((seconds, i) => record(String(i), { estimatedElapsedSeconds: seconds }));
  const outcomes = records.map((input, i) => result(input, { elapsedSeconds: (i + 1) * 100 }));
  const evaluation = evaluateRaceRecords(records, outcomes, options);
  assert.equal(evaluation.interpretation, 'synthetic-correctness-only');
  assert.deepEqual(evaluation.metrics, { maeSeconds: 25, biasSeconds: 5, medianAbsolutePercentageError: 10, p90AbsoluteErrorSeconds: 40, maxAbsoluteErrorSeconds: 40 });
  assert.equal(evaluation.counts.scored, 4);
  assert.deepEqual(evaluation.rows.map(row => row.errorSeconds), [-10, 20, -30, 40]);
});

test('tail metric uses nearest rank rather than interpolation; odd median and singleton are defined', () => {
  const records = Array.from({ length: 10 }, (_, i) => record(String(i), { estimatedElapsedSeconds: 1001 + i }));
  const outcomes = records.map(input => result(input, { elapsedSeconds: 1000 }));
  assert.equal(evaluateRaceRecords(records, outcomes, options).metrics!.p90AbsoluteErrorSeconds, 9);
  const odd = evaluateRaceRecords(records.slice(0, 3), outcomes.slice(0, 3), options);
  assert.equal(odd.metrics!.medianAbsolutePercentageError, 0.2);
  assert.deepEqual(report(record()).metrics, { maeSeconds: 0, biasSeconds: 0, medianAbsolutePercentageError: 0, p90AbsoluteErrorSeconds: 0, maxAbsoluteErrorSeconds: 0 });
});

test('empty and all-excluded cohorts return unavailable metrics, never invented zeros', () => {
  assert.equal(evaluateRaceRecords([], [], options).metrics, null);
  const input = record();
  const missing = evaluateRaceRecords([input], [], options);
  assert.equal(missing.metrics, null);
  assert.deepEqual(missing.rows[0].exclusions, ['missing_outcome']);
  assert.equal(missing.counts.missing, 1);
});

test('DNF, DNS, absent and explicit missing outcomes remain in the denominator and exclusion ledger', () => {
  const records = Array.from({ length: 5 }, (_, i) => record(String(i)));
  const outcomes = [
    result(records[0]), result(records[1], { status: 'dnf', elapsedSeconds: null }),
    result(records[2], { status: 'dns', elapsedSeconds: null, availableAt: '2026-05-09T08:00:00Z' }),
    result(records[3], { status: 'missing', elapsedSeconds: null, sourceId: null, availableAt: null }),
  ];
  const evaluation = evaluateRaceRecords(records, outcomes, options);
  assert.deepEqual(evaluation.counts, { records: 5, outcomes: 4, scored: 1, excluded: 4, dnf: 1, dns: 1, missing: 2, ambiguous: 0 });
  assert.deepEqual(evaluation.exclusionCounts, { dnf: 1, dns: 1, missing_outcome: 2 });
  assert.equal(evaluation.rows.length, records.length);
});

test('abstentions retain their reason and cannot be silently scored as zero', () => {
  const input = record('1', { estimatedElapsedSeconds: null, abstentionReason: 'Comparable-duration evidence absent' });
  const evaluation = report(input);
  assert.deepEqual(evaluation.rows[0].exclusions, ['abstained']);
  assert.equal(evaluation.rows[0].abstentionReason, input.abstentionReason);
  assert.equal(evaluation.metrics, null);
  assert.ok(report(record('1', { estimatedElapsedSeconds: null })).rows[0].exclusions.includes('invalid_estimate'));
});

test('freeze and evidence at cutoff are allowed only when cutoff is strictly before event', () => {
  const input = record('1', { frozenAt: '2026-05-09T08:00:00Z', evidence: [{ id: 'inputs', availableAt: '2026-05-09T08:00:00Z' }] });
  assert.deepEqual(validateFrozenRaceRecord(input), []);
  assert.ok(validateFrozenRaceRecord({ ...input, cutoffAt: input.eventStartAt }).includes('cutoff_not_before_event'));
  assert.ok(validateFrozenRaceRecord({ ...input, frozenAt: input.eventStartAt }).includes('frozen_after_cutoff'));
  assert.ok(validateFrozenRaceRecord({ ...input, frozenAt: '2026-05-09T08:00:00.001Z' }).includes('frozen_after_cutoff'));
});

test('rejects post-freeze evidence even before event, and rejects missing evidence vintages', () => {
  const input = record();
  assert.ok(validateFrozenRaceRecord({ ...input, evidence: [{ id: 'late', availableAt: '2026-05-09T07:00:00.001Z' }] }).includes('evidence_after_freeze'));
  assert.ok(validateFrozenRaceRecord({ ...input, evidence: [{ id: 'post-race', availableAt: '2026-05-11T08:00:00Z' }] }).includes('evidence_after_freeze'));
  assert.ok(validateFrozenRaceRecord({ ...input, evidence: [] }).includes('missing_evidence'));
  assert.ok(validateFrozenRaceRecord({ ...input, evidence: [...input.evidence, ...input.evidence] }).includes('duplicate_evidence'));
});

test('chronology uses actual instants across offsets and rejects ambiguous or impossible dates', () => {
  const input = record('1', { frozenAt: '2026-05-09T09:00:00+02:00' });
  assert.deepEqual(validateFrozenRaceRecord(input), []);
  for (const invalid of ['2026-05-09', '2026-05-09T07:00:00', '2026-02-30T07:00:00Z', '2026-05-09T24:00:00Z', 'not-a-date']) {
    assert.ok(validateFrozenRaceRecord({ ...input, frozenAt: invalid }).includes('invalid_timestamp'), invalid);
  }
  assert.ok(validateFrozenRaceRecord({ ...input, evidence: [{ id: 'invalid', availableAt: '2026-02-30T07:00:00Z' }] }).includes('invalid_timestamp'));
});

test('requires schema, version, cohort and snapshot/input identity rather than mixing revisions', () => {
  const input = record();
  assert.ok(report({ ...input, modelVersion: 'other-version' }).rows[0].exclusions.includes('model_version_mismatch'));
  assert.ok(report({ ...input, cohortId: 'another-population' }).rows[0].exclusions.includes('cohort_mismatch'));
  assert.ok(validateFrozenRaceRecord({ ...input, schemaVersion: 'unknown' as typeof RACE_EVALUATION_VERSION }).includes('unsupported_schema'));
  for (const field of ['snapshotId', 'inputRevision', 'athleteId', 'eventId', 'recordId'] as const) assert.ok(validateFrozenRaceRecord({ ...input, [field]: ' ' }).includes('invalid_identity'), field);
});

test('duplicate snapshots, records and athlete/event attempts are all excluded, not cherry-picked', () => {
  const input = record();
  const duplicate = evaluateRaceRecords([input, { ...input }], [result(input)], options);
  assert.equal(duplicate.counts.scored, 0);
  assert.deepEqual(duplicate.rows[0].exclusions, ['duplicate_record', 'duplicate_snapshot', 'duplicate_athlete_event']);
  const revised = evaluateRaceRecords([input, { ...input, recordId: 'second-record', snapshotId: 'second-snapshot' }], [result(input)], options);
  assert.equal(revised.exclusionCounts.duplicate_athlete_event, 2);
});

test('duplicate outcomes are ambiguous and orphan outcomes are reported without borrowing another athlete result', () => {
  const input = record();
  const evaluation = evaluateRaceRecords([input], [result(input), result(input, { elapsedSeconds: 4000 }), result(record('orphan'))], options);
  assert.equal(evaluation.counts.ambiguous, 1);
  assert.deepEqual(evaluation.rows[0].exclusions, ['duplicate_outcome']);
  assert.equal(evaluation.unmatchedOutcomes.length, 1);
  assert.equal(evaluation.metrics, null);
  const noMatch = evaluateRaceRecords([input], [result(record('someone-else'))], options);
  assert.equal(noMatch.counts.missing, 1);
  assert.equal(noMatch.unmatchedOutcomes.length, 1);
});

test('tuple join prevents delimiter collisions between athlete and event IDs', () => {
  const a = record('a', { athleteId: 'a:b', eventId: 'c' });
  const b = record('b', { athleteId: 'a', eventId: 'b:c' });
  assert.equal(evaluateRaceRecords([a, b], [result(a), result(b)], options).counts.scored, 2);
});

test('moving time, mismatched elapsed bases and impossible finish availability are not valid labels', () => {
  const input = record();
  assert.ok(report(input, { timeBasis: 'gun_elapsed' }).rows[0].exclusions.includes('time_basis_mismatch'));
  assert.ok(report({ ...input, timeBasis: 'gun_elapsed' }).rows[0].exclusions.includes('time_basis_mismatch'));
  assert.ok(report(input, { timeBasis: 'moving' as 'chip_elapsed' }).rows[0].exclusions.includes('time_basis_mismatch'));
  assert.ok(report(input, { availableAt: '2026-05-10T08:59:59Z' }).rows[0].exclusions.includes('outcome_before_finish'));
  assert.equal(report(input, { availableAt: '2026-05-10T09:00:00Z' }).counts.scored, 1);
  assert.ok(report(input, { sourceId: null }).rows[0].exclusions.includes('invalid_outcome'));
  assert.ok(report(input, { status: 'dnf', elapsedSeconds: 100 }).rows[0].exclusions.includes('invalid_outcome'));
});

test('malformed, nonfinite, zero and arithmetic-overflow durations are explicitly excluded', () => {
  for (const value of [NaN, Infinity, -1, 0, Number.MIN_VALUE, Number.MAX_VALUE]) {
    assert.ok(report(record('1', { estimatedElapsedSeconds: value })).rows[0].exclusions.includes('invalid_estimate'));
    assert.ok(report(record(), { elapsedSeconds: value }).rows[0].exclusions.includes('invalid_outcome'));
  }
  assert.ok(report(record(), { status: 'unknown' as 'finished' }).rows[0].exclusions.includes('invalid_outcome'));
});

test('athlete-level split keeps every race for a held-out athlete together and does not mutate inputs', () => {
  const records = [record('a'), record('b'), record('a-2', { athleteId: 'synthetic-athlete-a', eventId: 'synthetic-edition-2' })];
  const before = JSON.stringify(records);
  const split = partitionByAthlete(records, ['synthetic-athlete-a']);
  assert.equal(split.holdout.length, 2);
  assert.equal(split.training.length, 1);
  assert.ok(split.holdout.every(input => !split.training.some(train => train.athleteId === input.athleteId)));
  evaluateRaceRecords(records, records.map(input => result(input)), options);
  assert.equal(JSON.stringify(records), before);
  assert.throws(() => partitionByAthlete(records, ['']), /pseudonyms/);
});

function priorRace(): FrozenRaceRecord {
  return record('prior', {
    eventId: 'synthetic-prior-edition', eventStartAt: '2026-04-10T08:00:00Z', cutoffAt: '2026-04-09T08:00:00Z',
    frozenAt: '2026-04-09T07:00:00Z', evidence: [{ id: 'prior-inputs', availableAt: '2026-04-08T08:00:00Z' }],
  });
}

test('rolling-origin training requires a prior available outcome, not merely a prior event', () => {
  const candidate = priorRace(), target = record();
  const earlier = result(candidate, { availableAt: '2026-04-11T08:00:00Z' });
  assert.deepEqual(rollingOriginTrainingEligibility(candidate, earlier, target), { eligible: true, exclusions: [] });
  for (const availableAt of [target.frozenAt, target.cutoffAt, '2026-06-01T00:00:00Z']) {
    assert.ok(rollingOriginTrainingEligibility(candidate, { ...earlier, availableAt }, target).exclusions.includes('training_outcome_not_before_origin'));
  }
  const future = record('future', { eventId: 'future-edition', eventStartAt: '2026-06-01T00:00:00Z' });
  assert.equal(rollingOriginTrainingEligibility(future, result(future, { availableAt: '2026-06-02T00:00:00Z' }), target).eligible, false);
});

test('rolling origin excludes held-out athletes, same event, wrong identity, missing and unfinished labels', () => {
  const candidate = priorRace(), target = record();
  const earlier = result(candidate, { availableAt: '2026-04-11T08:00:00Z' });
  assert.ok(rollingOriginTrainingEligibility(candidate, earlier, target, [candidate.athleteId]).exclusions.includes('held_out_athlete'));
  assert.ok(rollingOriginTrainingEligibility(candidate, earlier, { ...target, eventId: candidate.eventId }).exclusions.includes('same_event'));
  assert.ok(rollingOriginTrainingEligibility(candidate, { ...earlier, athleteId: target.athleteId }, target).exclusions.includes('outcome_identity_mismatch'));
  assert.ok(rollingOriginTrainingEligibility(candidate, undefined, target).exclusions.includes('missing_outcome'));
  for (const status of ['dnf', 'dns'] as const) assert.ok(rollingOriginTrainingEligibility(candidate, { ...earlier, status, elapsedSeconds: null }, target).exclusions.includes(status));
  assert.ok(rollingOriginTrainingEligibility(candidate, earlier, { ...target, timeBasis: 'gun_elapsed' }).exclusions.includes('time_basis_mismatch'));
  assert.ok(rollingOriginTrainingEligibility(candidate, earlier, { ...target, cohortId: 'other' }).exclusions.includes('cohort_mismatch'));
});

test('returning-athlete training can use earlier races; valid abstentions do not erase usable historical labels', () => {
  const target = record(), candidate = { ...priorRace(), athleteId: target.athleteId, estimatedElapsedSeconds: null, abstentionReason: 'No estimate issued' };
  const outcome = result(candidate, { availableAt: '2026-04-11T08:00:00Z' });
  assert.equal(rollingOriginTrainingEligibility(candidate, outcome, target).eligible, true);
  assert.ok(rollingOriginTrainingEligibility(candidate, outcome, { ...target, frozenAt: 'invalid' }).exclusions.includes('invalid_target_record'));
});

test('real-data mode remains unvalidated and evaluation provenance cannot be omitted', () => {
  assert.equal(evaluateRaceRecords([], [], { ...options, dataKind: 'consented-pseudonymous' }).interpretation, 'unvalidated-real-data-evaluation');
  assert.throws(() => evaluateRaceRecords([], [], { ...options, dataKind: undefined as never }), /provenance/);
  assert.throws(() => evaluateRaceRecords([], [], { ...options, modelVersion: '' }), /provenance/);
});
