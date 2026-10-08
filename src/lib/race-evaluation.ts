/** Offline evaluation arithmetic only. No athlete reads, fitting, persistence, or forecast enablement.
 * See docs/research/race-scenarios/evaluation-protocol.md before using real records.
 */
export const RACE_EVALUATION_VERSION = 'race-evaluation-v1' as const;

export interface FrozenRaceRecord {
  schemaVersion: typeof RACE_EVALUATION_VERSION;
  recordId: string;
  snapshotId: string;
  inputRevision: string;
  modelVersion: string;
  timeBasis: ElapsedTimeBasis;
  athleteId: string; // pseudonym, stable across events and data partitions
  eventId: string; // edition-specific pseudonym, stable across participating athletes
  cohortId: string; // preregistered sport/distance/conditions population
  eventStartAt: string;
  cutoffAt: string;
  frozenAt: string;
  evidence: readonly {
    id: string;
    availableAt: string; // when this exact input/forecast vintage was available
  }[];
  estimatedElapsedSeconds: number | null;
  abstentionReason: string | null;
}

export type OutcomeStatus = 'finished' | 'dnf' | 'dns' | 'missing';
export type ElapsedTimeBasis = 'chip_elapsed' | 'gun_elapsed';
export interface RaceEvaluationOutcome {
  athleteId: string;
  eventId: string;
  status: OutcomeStatus;
  elapsedSeconds: number | null;
  timeBasis: ElapsedTimeBasis;
  availableAt: string | null;
  sourceId: string | null; // pseudonymous source reference, not a public athlete URL
}

export interface RaceEvaluationOptions {
  dataKind: 'synthetic' | 'consented-pseudonymous';
  modelVersion: string;
  cohortId: string;
  timeBasis: ElapsedTimeBasis;
}

export type EvaluationExclusion =
  | 'invalid_identity' | 'unsupported_schema' | 'model_version_mismatch' | 'cohort_mismatch'
  | 'invalid_timestamp' | 'cutoff_not_before_event' | 'frozen_after_cutoff'
  | 'missing_evidence' | 'duplicate_evidence' | 'evidence_after_freeze'
  | 'invalid_estimate' | 'abstained' | 'duplicate_record' | 'duplicate_snapshot'
  | 'duplicate_athlete_event' | 'duplicate_outcome' | 'missing_outcome'
  | 'dnf' | 'dns' | 'invalid_outcome' | 'outcome_identity_mismatch'
  | 'invalid_time_basis' | 'time_basis_mismatch' | 'outcome_before_finish'
  | 'held_out_athlete' | 'same_event' | 'training_outcome_not_before_origin'
  | 'invalid_target_record';

export interface EvaluationRow {
  recordId: string;
  snapshotId: string;
  athleteId: string;
  eventId: string;
  outcomeStatus: OutcomeStatus | 'ambiguous' | 'invalid';
  abstentionReason: string | null;
  exclusions: EvaluationExclusion[];
  errorSeconds: number | null; // estimated minus observed; positive means slower estimate
  absolutePercentageError: number | null; // percent, denominator is observed elapsed time
}

export interface RaceEvaluationReport {
  schemaVersion: typeof RACE_EVALUATION_VERSION;
  interpretation: 'synthetic-correctness-only' | 'unvalidated-real-data-evaluation';
  modelVersion: string;
  cohortId: string;
  timeBasis: ElapsedTimeBasis;
  counts: {
    records: number;
    outcomes: number;
    scored: number;
    excluded: number;
    dnf: number;
    dns: number;
    missing: number;
    ambiguous: number;
  };
  exclusionCounts: Partial<Record<EvaluationExclusion, number>>;
  rows: EvaluationRow[];
  unmatchedOutcomes: RaceEvaluationOutcome[];
  metrics: {
    maeSeconds: number;
    biasSeconds: number;
    medianAbsolutePercentageError: number;
    p90AbsoluteErrorSeconds: number; // nearest-rank percentile, not an interval
    maxAbsoluteErrorSeconds: number;
  } | null;
}

const nonempty = (value: string | null): value is string => typeof value === 'string' && value.trim().length > 0;
// A generous arithmetic bound, not a physiological or cohort eligibility rule.
const duration = (value: number | null): value is number => typeof value === 'number' && Number.isFinite(value) && value >= 0.001 && value <= 366 * 86400;
const key = (record: { athleteId: string; eventId: string }) => JSON.stringify([record.athleteId, record.eventId]);

/** Require an unambiguous offset and reject Date.parse's invalid-calendar normalization. */
function timestamp(value: string | null): number {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(value)) return NaN;
  const [year, month, day] = value.slice(0, 10).split('-').map(Number);
  const calendar = new Date(0);
  calendar.setUTCFullYear(year, month - 1, day);
  const [hour, minute, second] = value.slice(11, 19).split(':').map(Number);
  if (calendar.getUTCFullYear() !== year || calendar.getUTCMonth() !== month - 1 || calendar.getUTCDate() !== day || hour > 23 || minute > 59 || second > 59) return NaN;
  return Date.parse(value);
}

/** Checks declared provenance. This cannot authenticate timestamps or hash snapshot contents. */
export function validateFrozenRaceRecord(record: FrozenRaceRecord): EvaluationExclusion[] {
  const issues: EvaluationExclusion[] = [];
  if (![record.recordId, record.snapshotId, record.inputRevision, record.modelVersion, record.athleteId, record.eventId, record.cohortId].every(nonempty)) issues.push('invalid_identity');
  if (record.schemaVersion !== RACE_EVALUATION_VERSION) issues.push('unsupported_schema');
  if (!['chip_elapsed', 'gun_elapsed'].includes(record.timeBasis)) issues.push('invalid_time_basis');
  const event = timestamp(record.eventStartAt), cutoff = timestamp(record.cutoffAt), frozen = timestamp(record.frozenAt);
  if (![event, cutoff, frozen].every(Number.isFinite)) issues.push('invalid_timestamp');
  if (cutoff >= event) issues.push('cutoff_not_before_event');
  if (frozen > cutoff) issues.push('frozen_after_cutoff');
  if (record.evidence.length === 0) issues.push('missing_evidence');
  if (new Set(record.evidence.map(evidence => evidence.id)).size !== record.evidence.length) issues.push('duplicate_evidence');
  for (const evidence of record.evidence) {
    if (!nonempty(evidence.id)) issues.push('invalid_identity');
    const available = timestamp(evidence.availableAt);
    if (!Number.isFinite(available)) issues.push('invalid_timestamp');
    if (available > frozen) issues.push('evidence_after_freeze');
  }
  if (record.estimatedElapsedSeconds === null && nonempty(record.abstentionReason)) issues.push('abstained');
  else if (!duration(record.estimatedElapsedSeconds) || record.abstentionReason !== null) issues.push('invalid_estimate');
  return [...new Set(issues)];
}

function outcomeIssues(record: FrozenRaceRecord, outcome: RaceEvaluationOutcome | undefined, timeBasis: ElapsedTimeBasis): EvaluationExclusion[] {
  if (!outcome) return ['missing_outcome'];
  const issues: EvaluationExclusion[] = [];
  if (record.athleteId !== outcome.athleteId || record.eventId !== outcome.eventId) issues.push('outcome_identity_mismatch');
  if (outcome.timeBasis !== timeBasis) issues.push('time_basis_mismatch');
  if (!['finished', 'dnf', 'dns', 'missing'].includes(outcome.status)) return [...issues, 'invalid_outcome'];
  if (outcome.status === 'missing') issues.push('missing_outcome');
  if (outcome.status === 'dnf' || outcome.status === 'dns') issues.push(outcome.status);
  if (outcome.status !== 'finished' && outcome.elapsedSeconds !== null) issues.push('invalid_outcome');
  if (outcome.status === 'missing') return issues;
  const available = timestamp(outcome.availableAt);
  if (!nonempty(outcome.sourceId) || !Number.isFinite(available)) issues.push('invalid_outcome');
  if (outcome.status === 'finished') {
    if (!duration(outcome.elapsedSeconds)) issues.push('invalid_outcome');
    else if (available < timestamp(record.eventStartAt) + outcome.elapsedSeconds * 1000) issues.push('outcome_before_finish');
  } else if (outcome.status === 'dnf' && available < timestamp(record.eventStartAt)) issues.push('outcome_before_finish');
  // DNS can legitimately be known before the event, but is never a finish-time label.
  return issues;
}

function countsBy<T>(records: readonly T[], identify: (record: T) => string): Map<string, number> {
  const counts = new Map<string, number>();
  for (const record of records) counts.set(identify(record), (counts.get(identify(record)) ?? 0) + 1);
  return counts;
}

/** One preregistered cohort, model version and forecast horizon per call. Never selects a best snapshot. */
export function evaluateRaceRecords(records: readonly FrozenRaceRecord[], outcomes: readonly RaceEvaluationOutcome[], options: RaceEvaluationOptions): RaceEvaluationReport {
  if (!nonempty(options.modelVersion) || !nonempty(options.cohortId) || !['chip_elapsed', 'gun_elapsed'].includes(options.timeBasis) || !['synthetic', 'consented-pseudonymous'].includes(options.dataKind)) throw new Error('Explicit evaluation provenance, model, cohort and elapsed-time basis are required');
  const recordCounts = countsBy(records, record => record.recordId);
  const snapshotCounts = countsBy(records, record => record.snapshotId);
  const eventCounts = countsBy(records, key);
  const outcomesByEvent = new Map<string, RaceEvaluationOutcome[]>();
  for (const outcome of outcomes) outcomesByEvent.set(key(outcome), [...(outcomesByEvent.get(key(outcome)) ?? []), outcome]);
  const rows = records.map((record): EvaluationRow => {
    const matches = outcomesByEvent.get(key(record)) ?? [];
    const outcome = matches.length === 1 ? matches[0] : undefined;
    const issues = validateFrozenRaceRecord(record);
    if (record.modelVersion !== options.modelVersion) issues.push('model_version_mismatch');
    if (record.timeBasis !== options.timeBasis) issues.push('time_basis_mismatch');
    if (record.cohortId !== options.cohortId) issues.push('cohort_mismatch');
    if (recordCounts.get(record.recordId)! > 1) issues.push('duplicate_record');
    if (snapshotCounts.get(record.snapshotId)! > 1) issues.push('duplicate_snapshot');
    if (eventCounts.get(key(record))! > 1) issues.push('duplicate_athlete_event');
    if (matches.length > 1) issues.push('duplicate_outcome');
    else issues.push(...outcomeIssues(record, outcome, options.timeBasis));
    const exclusions = [...new Set(issues)];
    const error = exclusions.length === 0 ? record.estimatedElapsedSeconds! - outcome!.elapsedSeconds! : null;
    const status = outcome?.status;
    return {
      recordId: record.recordId, snapshotId: record.snapshotId, athleteId: record.athleteId, eventId: record.eventId,
      outcomeStatus: matches.length > 1 ? 'ambiguous' : !outcome ? 'missing' : status && ['finished', 'dnf', 'dns', 'missing'].includes(status) ? status : 'invalid',
      abstentionReason: record.abstentionReason, exclusions, errorSeconds: error,
      absolutePercentageError: error === null ? null : Math.abs(error) / outcome!.elapsedSeconds! * 100,
    };
  });
  const scored = rows.filter(row => row.errorSeconds !== null);
  const absoluteErrors = scored.map(row => Math.abs(row.errorSeconds!)).sort((a, b) => a - b);
  const percentages = scored.map(row => row.absolutePercentageError!).sort((a, b) => a - b);
  const n = scored.length;
  const exclusionCounts: RaceEvaluationReport['exclusionCounts'] = {};
  for (const row of rows) for (const issue of row.exclusions) exclusionCounts[issue] = (exclusionCounts[issue] ?? 0) + 1;
  return {
    schemaVersion: RACE_EVALUATION_VERSION,
    interpretation: options.dataKind === 'synthetic' ? 'synthetic-correctness-only' : 'unvalidated-real-data-evaluation',
    modelVersion: options.modelVersion, cohortId: options.cohortId, timeBasis: options.timeBasis,
    counts: {
      records: records.length, outcomes: outcomes.length, scored: n, excluded: rows.length - n,
      dnf: rows.filter(row => row.outcomeStatus === 'dnf').length,
      dns: rows.filter(row => row.outcomeStatus === 'dns').length,
      missing: rows.filter(row => row.outcomeStatus === 'missing').length,
      ambiguous: rows.filter(row => row.outcomeStatus === 'ambiguous').length,
    },
    exclusionCounts, rows,
    unmatchedOutcomes: outcomes.filter(outcome => !eventCounts.has(key(outcome))),
    metrics: n === 0 ? null : {
      maeSeconds: absoluteErrors.reduce((sum, value) => sum + value, 0) / n,
      biasSeconds: scored.reduce((sum, row) => sum + row.errorSeconds!, 0) / n,
      medianAbsolutePercentageError: n % 2 ? percentages[(n - 1) / 2] : (percentages[n / 2 - 1] + percentages[n / 2]) / 2,
      p90AbsoluteErrorSeconds: absoluteErrors[Math.ceil(n * 0.9) - 1],
      maxAbsoluteErrorSeconds: absoluteErrors[n - 1],
    },
  };
}

/** IDs must be selected before outcome inspection; no race-level random split or fitting occurs here. */
export function partitionByAthlete<T extends { athleteId: string }>(records: readonly T[], heldOutAthleteIds: readonly string[]): { training: T[]; holdout: T[] } {
  if (![...heldOutAthleteIds, ...records.map(record => record.athleteId)].every(nonempty)) throw new Error('Stable nonempty athlete pseudonyms are required');
  const heldOut = new Set(heldOutAthleteIds);
  return { training: records.filter(record => !heldOut.has(record.athleteId)), holdout: records.filter(record => heldOut.has(record.athleteId)) };
}

/** For outcome-based fitting only: returning athletes may contribute earlier races unless held out. */
export function rollingOriginTrainingEligibility(candidate: FrozenRaceRecord, outcome: RaceEvaluationOutcome | undefined, target: FrozenRaceRecord, heldOutAthleteIds: readonly string[] = []): { eligible: boolean; exclusions: EvaluationExclusion[] } {
  const issues: EvaluationExclusion[] = validateFrozenRaceRecord(candidate).filter(issue => issue !== 'abstained');
  if (validateFrozenRaceRecord(target).some(issue => issue !== 'abstained')) issues.push('invalid_target_record');
  issues.push(...outcomeIssues(candidate, outcome, target.timeBasis));
  if (candidate.timeBasis !== target.timeBasis) issues.push('time_basis_mismatch');
  if (candidate.cohortId !== target.cohortId) issues.push('cohort_mismatch');
  if (heldOutAthleteIds.includes(candidate.athleteId)) issues.push('held_out_athlete');
  if (candidate.eventId === target.eventId) issues.push('same_event');
  // frozenAt is at or before cutoffAt, so this disallows labels learned after the actual freeze.
  const origin = timestamp(target.frozenAt);
  if (!(timestamp(candidate.eventStartAt) < origin) || !(timestamp(outcome?.availableAt ?? null) < origin)) issues.push('training_outcome_not_before_origin');
  const exclusions = [...new Set(issues)];
  return { eligible: exclusions.length === 0, exclusions };
}
