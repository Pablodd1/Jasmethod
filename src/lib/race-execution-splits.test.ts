import test from 'node:test';
import assert from 'node:assert/strict';
import { buildExecutionSplits, executionSplitsCsv } from './race-execution-splits';
import type { ScenarioLegResult } from './race-scenario';
const leg = (pairs: number[][]): ScenarioLegResult => ({ id: 'run', sport: 'run', durationSeconds: pairs.reduce((sum, s) => sum + s[1], 0), paceSecondsPerKm: null, powerW: null, actualAveragePowerW: null, runPowerTargetW: null, hrTargetBpm: null, mechanicalWorkKj: null, metabolicKcal: null, missingInputs: [], warnings: [], segments: pairs.map(([distanceM, durationSeconds], index) => ({ index, distanceM, durationSeconds, grade: 0, speedMps: distanceM / durationSeconds, paceSecondsPerKm: durationSeconds / distanceM * 1000, actualPowerW: null, mechanicalWorkKj: null })) });
test('splits interpolate across segment boundaries without changing totals', () => {
  const input = leg([[600, 180], [900, 360], [750, 225]]);
  const before = structuredClone(input), rows = buildExecutionSplits(input, 1000);
  assert.deepEqual(rows, [{ endDistanceM: 1000, distanceM: 1000, durationSeconds: 340, cumulativeSeconds: 340 }, { endDistanceM: 2000, distanceM: 1000, durationSeconds: 350, cumulativeSeconds: 690 }, { endDistanceM: 2250, distanceM: 250, durationSeconds: 75, cumulativeSeconds: 765 }]);
  assert.deepEqual(input, before);
});
test('cumulative rounding conserves displayed seconds for kilometer and exact mile splits', () => {
  for (const interval of [1000, 1609.344]) for (const input of [leg([[5000, 1500.49]]), leg([[777, 33.33], [1500, 455.45], [1000, 77.78]])]) {
    const rows = buildExecutionSplits(input, interval);
    assert.equal(rows.reduce((sum, s) => sum + s.durationSeconds, 0), Math.round(input.durationSeconds!));
    assert.equal(rows.at(-1)!.cumulativeSeconds, Math.round(input.durationSeconds!));
    assert.equal(rows.reduce((sum, s) => sum + s.distanceM, 0), input.segments.reduce((sum, s) => sum + s.distanceM, 0));
  }
});
test('exact boundary has no empty final split and subinterval course has one', () => {
  assert.equal(buildExecutionSplits(leg([[1000, 300], [1000, 400]]), 1000).length, 2);
  assert.equal(buildExecutionSplits(leg([[50, 60]]), 1000).length, 1);
});
test('unavailable, malformed and inconsistent output cannot fabricate splits', () => {
  for (const input of [{ ...leg([[1000, 300]]), durationSeconds: null }, { ...leg([[1000, 300]]), durationSeconds: 400 }, leg([]), leg([[NaN, 1]]), leg([[1, Infinity]]), leg([[-1, 10]])]) assert.deepEqual(buildExecutionSplits(input, 1000), []);
  for (const interval of [0, -1, NaN, Infinity, 1]) assert.deepEqual(buildExecutionSplits(leg([[1000, 300]]), interval), []);
});
test('CSV uses exactly the displayed split and cumulative seconds, with no user text', () => {
  const rows = buildExecutionSplits(leg([[1100, 330.6]]), 1000);
  assert.equal(executionSplitsCsv(rows), 'scenario_only_end_distance_m,split_distance_m,split_seconds,cumulative_leg_seconds\r\n1000.000,1000.000,301,301\r\n1100.000,100.000,30,331\r\n');
});

test('aggregate overflow is rejected and floating point boundaries do not add a phantom split', () => {
  assert.deepEqual(buildExecutionSplits(leg([[1000, Number.MAX_VALUE], [1000, Number.MAX_VALUE]]), 1000), []);
  const input = leg([[600, 180], [400.000000001, 120]]);
  const rows = buildExecutionSplits(input, 1000);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].endDistanceM, 1000.000000001);
  assert.equal(rows[0].durationSeconds, 300);
});
