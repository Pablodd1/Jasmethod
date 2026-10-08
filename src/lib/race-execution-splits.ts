import type { ScenarioLegResult } from './race-scenario';

/** Read-only re-binning of the existing scenario, never a new pacing/capacity model. */
export interface ExecutionSplit {
  endDistanceM: number;
  distanceM: number;
  durationSeconds: number;
  cumulativeSeconds: number;
}
export function buildExecutionSplits(leg: ScenarioLegResult, intervalM: number): ExecutionSplit[] {
  if (leg.durationSeconds === null || !Number.isFinite(leg.durationSeconds) || leg.durationSeconds <= 0 ||
      !Number.isFinite(intervalM) || intervalM < 100 || !leg.segments.length) return [];
  const segments = leg.segments;
  if (segments.some(s => !Number.isFinite(s.distanceM) || s.distanceM <= 0 || !Number.isFinite(s.durationSeconds) || s.durationSeconds <= 0)) return [];
  const distance = segments.reduce((sum, s) => sum + s.distanceM, 0);
  const total = segments.reduce((sum, s) => sum + s.durationSeconds, 0);
  // Refuse inconsistent historical output rather than silently rescale it.
  if (!Number.isFinite(distance) || !Number.isFinite(total) || Math.ceil(distance / intervalM) > 10000 ||
      Math.abs(total - leg.durationSeconds) > Math.max(1e-6, total * 1e-10)) return [];
  const splits: ExecutionSplit[] = [];
  let index = 0, segmentStart = 0, timeBeforeSegment = 0, previousDistance = 0, previousRoundedTime = 0;
  // Ignore sub-micrometer summation noise at an otherwise exact boundary.
  const count = Math.max(1, Math.ceil((distance - 1e-7) / intervalM));
  for (let n = 1; n <= count; n++) {
    const end = n === count ? distance : Math.min(n * intervalM, distance);
    while (index < segments.length - 1 && end > segmentStart + segments[index].distanceM) {
      segmentStart += segments[index].distanceM;
      timeBeforeSegment += segments[index].durationSeconds;
      index++;
    }
    const segment = segments[index];
    const time = n === count ? total : timeBeforeSegment + (end - segmentStart) / segment.distanceM * segment.durationSeconds;
    const roundedTime = Math.round(time);
    splits.push({ endDistanceM: end, distanceM: end - previousDistance, durationSeconds: roundedTime - previousRoundedTime, cumulativeSeconds: roundedTime });
    previousDistance = end;
    previousRoundedTime = roundedTime;
  }
  return splits;
}
/** Numeric rows and fixed headers only: no user text / spreadsheet formulas. */
export function executionSplitsCsv(splits: ExecutionSplit[]): string {
  return ['scenario_only_end_distance_m,split_distance_m,split_seconds,cumulative_leg_seconds',
    ...splits.map(s => [s.endDistanceM.toFixed(3), s.distanceM.toFixed(3), s.durationSeconds, s.cumulativeSeconds].join(','))].join('\r\n') + '\r\n';
}
