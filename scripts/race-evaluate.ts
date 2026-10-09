/** Offline import boundary. No database, provider calls, fitting or forecast enablement. */
import { open, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import {
  evaluateRaceRecords, RACE_EVALUATION_VERSION,
  type FrozenRaceRecord, type RaceEvaluationOutcome, type RaceEvaluationOptions,
} from '../src/lib/race-evaluation';

const MAX_BYTES = 10 * 1024 * 1024;
const MAX_ROWS = 10_000;
const MAX_EVIDENCE = 1_000;
const MAX_STRING = 2_048;
type JsonObject = Record<string, unknown>;

function fail(path: string, requirement: string): never {
  // Report field paths only. Never echo imported athlete values or JSON contents.
  throw new Error(`${path}: ${requirement}`);
}
function object(value: unknown, path: string, fields: readonly string[]): JsonObject {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(path, 'expected an object');
  const result = value as JsonObject;
  if (Object.keys(result).length !== fields.length || fields.some(field => !Object.hasOwn(result, field))) {
    fail(path, 'required fields are missing or unexpected fields are present');
  }
  return result;
}
function string(value: unknown, path: string, nullable = false): void {
  if (nullable && value === null) return;
  if (typeof value !== 'string' || value.length > MAX_STRING) fail(path, `expected a string of at most ${MAX_STRING} characters${nullable ? ' or null' : ''}`);
}
function number(value: unknown, path: string): void {
  if (value !== null && (typeof value !== 'number' || !Number.isFinite(value))) fail(path, 'expected a finite number or null');
}
function oneOf(value: unknown, path: string, values: readonly string[]): void {
  if (typeof value !== 'string' || !values.includes(value)) fail(path, `expected one of ${values.join(', ')}`);
}
function array(value: unknown, path: string, max: number): unknown[] {
  if (!Array.isArray(value) || value.length > max) fail(path, `expected an array with at most ${max} entries`);
  return value;
}

function parseInput(value: unknown): { records: FrozenRaceRecord[]; outcomes: RaceEvaluationOutcome[]; options: RaceEvaluationOptions } {
  const input = object(value, 'input', ['records', 'outcomes', 'options']);
  const options = object(input.options, 'options', ['dataKind', 'modelVersion', 'cohortId', 'timeBasis']);
  oneOf(options.dataKind, 'options.dataKind', ['synthetic', 'consented-pseudonymous']);
  for (const field of ['modelVersion', 'cohortId']) {
    string(options[field], `options.${field}`);
    if (!(options[field] as string).trim()) fail(`options.${field}`, 'must be nonempty');
  }
  oneOf(options.timeBasis, 'options.timeBasis', ['chip_elapsed', 'gun_elapsed']);
  const recordFields = ['schemaVersion', 'recordId', 'snapshotId', 'inputRevision', 'modelVersion', 'timeBasis', 'athleteId', 'eventId', 'cohortId', 'eventStartAt', 'cutoffAt', 'frozenAt', 'evidence', 'estimatedElapsedSeconds', 'abstentionReason'];
  const records = array(input.records, 'records', MAX_ROWS);
  records.forEach((value, index) => {
    const path = `records[${index}]`, record = object(value, path, recordFields);
    for (const field of recordFields.filter(field => !['evidence', 'estimatedElapsedSeconds', 'abstentionReason'].includes(field))) string(record[field], `${path}.${field}`);
    oneOf(record.schemaVersion, `${path}.schemaVersion`, [RACE_EVALUATION_VERSION]);
    oneOf(record.timeBasis, `${path}.timeBasis`, ['chip_elapsed', 'gun_elapsed']);
    number(record.estimatedElapsedSeconds, `${path}.estimatedElapsedSeconds`);
    string(record.abstentionReason, `${path}.abstentionReason`, true);
    array(record.evidence, `${path}.evidence`, MAX_EVIDENCE).forEach((value, index) => {
      const evidencePath = `${path}.evidence[${index}]`, evidence = object(value, evidencePath, ['id', 'availableAt']);
      string(evidence.id, `${evidencePath}.id`);
      string(evidence.availableAt, `${evidencePath}.availableAt`);
    });
  });
  const outcomes = array(input.outcomes, 'outcomes', MAX_ROWS);
  outcomes.forEach((value, index) => {
    const path = `outcomes[${index}]`, outcome = object(value, path, ['athleteId', 'eventId', 'status', 'elapsedSeconds', 'timeBasis', 'availableAt', 'sourceId']);
    string(outcome.athleteId, `${path}.athleteId`);
    string(outcome.eventId, `${path}.eventId`);
    oneOf(outcome.status, `${path}.status`, ['finished', 'dnf', 'dns', 'missing']);
    oneOf(outcome.timeBasis, `${path}.timeBasis`, ['chip_elapsed', 'gun_elapsed']);
    number(outcome.elapsedSeconds, `${path}.elapsedSeconds`);
    string(outcome.availableAt, `${path}.availableAt`, true);
    string(outcome.sourceId, `${path}.sourceId`, true);
  });
  // All nested shapes are checked above; semantic defects become report exclusions.
  return { records: records as FrozenRaceRecord[], outcomes: outcomes as RaceEvaluationOutcome[], options: options as unknown as RaceEvaluationOptions };
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  if (args.length === 1 && args[0] === '--help') {
    process.stdout.write('Usage: node --import tsx scripts/race-evaluate.ts --input INPUT.json [--output NEW_REPORT.json]\nOffline arithmetic only. Existing output files are never overwritten.\n');
    return;
  }
  let inputPath: string | undefined, outputPath: string | undefined;
  for (let index = 0; index < args.length; index += 2) {
    const flag = args[index], value = args[index + 1];
    if (!value || value.startsWith('--')) throw new Error('Every flag requires a file path');
    if (flag === '--input' && !inputPath) inputPath = value;
    else if (flag === '--output' && !outputPath) outputPath = value;
    else throw new Error('Unknown or repeated flag; use --help');
  }
  if (!inputPath) throw new Error('--input is required; use --help');
  if (outputPath && resolve(inputPath) === resolve(outputPath)) throw new Error('Output must not replace the input');
  const handle = await open(inputPath, 'r');
  let bytes: Buffer;
  try {
    const stat = await handle.stat();
    if (!stat.isFile() || stat.size > MAX_BYTES) throw new Error('Input must be a regular file no larger than 10 MiB');
    // Bounded read also protects against a file growing after stat().
    bytes = Buffer.alloc(MAX_BYTES + 1);
    let length = 0;
    while (length < bytes.length) {
      const { bytesRead } = await handle.read(bytes, length, bytes.length - length, null);
      if (!bytesRead) break;
      length += bytesRead;
    }
    if (length > MAX_BYTES) throw new Error('Input exceeds 10 MiB');
    bytes = bytes.subarray(0, length);
  } finally { await handle.close(); }
  let decoded: unknown;
  try { decoded = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)); }
  catch { throw new Error('Input must contain valid UTF-8 JSON'); }
  const { records, outcomes, options } = parseInput(decoded);
  const report = evaluateRaceRecords(records, outcomes, options);
  const serialized = JSON.stringify(report, null, 2) + '\n';
  if (outputPath) {
    // wx rejects existing files, hard links and symlinks, including aliases of input.
    await writeFile(outputPath, serialized, { flag: 'wx', mode: 0o600 });
    process.stderr.write(`Offline report created: ${report.counts.scored} scored, ${report.counts.excluded} excluded. ${report.interpretation}.\n`);
  } else process.stdout.write(serialized);
}

main().catch((error: unknown) => {
  const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : null;
  // Filesystem diagnostics can contain sensitive paths. Print only the error code.
  process.stderr.write(`Race evaluation failed: ${code ?? (error instanceof Error ? error.message : 'unknown error')}\n`);
  process.exitCode = 1;
});
