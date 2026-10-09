import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync, rmSync, linkSync, symlinkSync, truncateSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

// Invented correctness fixtures. These are never athlete data or predictive validation.
function fixture() {
  const options = { dataKind: 'synthetic', modelVersion: 'synthetic-model', cohortId: 'synthetic-10km-24h', timeBasis: 'chip_elapsed' };
  const records = [3600, 3900, 4000].map((estimate, index) => ({
    schemaVersion: 'race-evaluation-v1', recordId: `synthetic-record-${index}`, snapshotId: `synthetic-snapshot-${index}`,
    inputRevision: 'synthetic-input-v1', modelVersion: options.modelVersion, timeBasis: options.timeBasis,
    athleteId: `synthetic-athlete-${index}`, eventId: 'synthetic-event', cohortId: options.cohortId,
    eventStartAt: '2026-05-10T08:00:00Z', cutoffAt: '2026-05-09T08:00:00Z', frozenAt: '2026-05-09T07:00:00Z',
    evidence: [{ id: 'synthetic-evidence', availableAt: '2026-05-08T08:00:00Z' }],
    estimatedElapsedSeconds: estimate, abstentionReason: null,
  }));
  const outcomes = records.slice(0, 2).map(record => ({ athleteId: record.athleteId, eventId: record.eventId,
    status: 'finished', elapsedSeconds: 3700, timeBasis: options.timeBasis, availableAt: '2026-05-11T08:00:00Z', sourceId: 'synthetic-source' }));
  return { records, outcomes, options };
}
const script = resolve('scripts/race-evaluate.ts');
function run(args: string[]) {
  const env = { ...process.env };
  // A CLI subprocess is not a child test runner and must use ordinary stdout/stderr.
  delete env.NODE_TEST_CONTEXT;
  const result = spawnSync(process.execPath, ['--import', 'tsx', script, ...args], { encoding: 'utf8', env });
  assert.ifError(result.error);
  return result;
}
function temporary<T>(operation: (dir: string) => T): T {
  const dir = mkdtempSync(join(tmpdir(), 'jmm-race-cli-'));
  try { return operation(dir); } finally { rmSync(dir, { recursive: true, force: true }); }
}

test('CLI reports known synthetic arithmetic and retains missing-outcome exclusions', () => temporary(dir => {
  const path = join(dir, 'input.json');
  writeFileSync(path, JSON.stringify(fixture()));
  const result = run(['--input', path]);
  assert.equal(result.status, 0, result.stderr);
  const report = JSON.parse(result.stdout);
  assert.equal(report.interpretation, 'synthetic-correctness-only');
  assert.equal(report.counts.scored, 2);
  assert.equal(report.counts.excluded, 1);
  assert.equal(report.exclusionCounts.missing_outcome, 1);
  assert.equal(report.metrics.maeSeconds, 150);
  assert.equal(report.metrics.biasSeconds, 50);
  assert.equal(report.metrics.p90AbsoluteErrorSeconds, 200);
  assert.ok(Math.abs(report.metrics.medianAbsolutePercentageError - 150 / 3700 * 100) < 1e-10);
}));

test('CLI rejects malformed nested input without exposing supplied values or writing a report', () => temporary(dir => {
  const input = join(dir, 'input.json'), output = join(dir, 'report.json');
  const malformed: unknown[] = [null, { ...fixture(), unexpected: 'private-value-do-not-log' }];
  const nested = fixture();
  (nested.records[0] as unknown as Record<string, unknown>).evidence = [null];
  malformed.push(nested);
  const missing = fixture();
  delete (missing.records[0] as unknown as Record<string, unknown>).abstentionReason;
  malformed.push(missing);
  const wrongType = fixture();
  (wrongType.records[0] as unknown as Record<string, unknown>).estimatedElapsedSeconds = 'private-value-do-not-log';
  malformed.push(wrongType);
  malformed.push({ ...fixture(), records: new Array(10_001).fill(null) });
  const overlong = fixture();
  overlong.records[0].athleteId = 'x'.repeat(2_049);
  malformed.push(overlong);
  for (const value of malformed) {
    writeFileSync(input, JSON.stringify(value));
    const result = run(['--input', input, '--output', output]);
    assert.equal(result.status, 1);
    assert.equal(result.stdout, '');
    assert.ok(!result.stderr.includes('private-value-do-not-log'));
    assert.throws(() => readFileSync(output));
  }
  writeFileSync(input, '{private-value-do-not-log');
  assert.match(run(['--input', input]).stderr, /valid UTF-8 JSON/);
  writeFileSync(input, Buffer.from([0xff]));
  assert.match(run(['--input', input]).stderr, /valid UTF-8 JSON/);
  writeFileSync(input, JSON.stringify(fixture()).replace('3600', '1e400'));
  assert.match(run(['--input', input]).stderr, /finite number/);
}));

test('CLI excludes semantic chronology errors and never labels declared real data as validated', () => temporary(dir => {
  const input = fixture();
  input.options.dataKind = 'consented-pseudonymous';
  input.records[0].evidence[0].availableAt = '2026-05-10T08:00:00Z';
  const path = join(dir, 'input.json');
  writeFileSync(path, JSON.stringify(input));
  const result = run(['--input', path]);
  assert.equal(result.status, 0, result.stderr);
  const report = JSON.parse(result.stdout);
  assert.equal(report.interpretation, 'unvalidated-real-data-evaluation');
  assert.equal(report.exclusionCounts.evidence_after_freeze, 1);
  assert.equal(report.counts.scored, 1);
}));

test('CLI refuses existing output, input aliases, oversized files, and unknown or repeated flags', () => temporary(dir => {
  const input = join(dir, 'input.json'), output = join(dir, 'output.json');
  const bytes = JSON.stringify(fixture());
  writeFileSync(input, bytes);
  writeFileSync(output, 'existing-report');
  assert.equal(run(['--input', input, '--output', output]).status, 1);
  assert.equal(readFileSync(output, 'utf8'), 'existing-report');
  for (const alias of [input, join(dir, 'hard.json'), join(dir, 'sym.json')]) {
    if (alias.includes('hard')) linkSync(input, alias);
    if (alias.includes('sym')) symlinkSync(input, alias);
    assert.equal(run(['--input', input, '--output', alias]).status, 1);
    assert.equal(readFileSync(input, 'utf8'), bytes);
  }
  for (const args of [[], ['--input'], ['--wat', input], ['--input', input, '--input', input]]) assert.equal(run(args).status, 1);
  assert.equal(run(['--help']).status, 0);
  truncateSync(input, 10 * 1024 * 1024 + 1);
  assert.match(run(['--input', input]).stderr, /no larger than 10 MiB/);
}));

test('CLI can create a new private report and preserves zero-score metrics as null', () => temporary(dir => {
  const input = fixture();
  input.records = [];
  input.outcomes = [];
  const path = join(dir, 'input.json'), output = join(dir, 'new-report.json');
  writeFileSync(path, JSON.stringify(input));
  const result = run(['--input', path, '--output', output]);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout, '');
  assert.equal(JSON.parse(readFileSync(output, 'utf8')).metrics, null);
}));
