import { type ActivityStreams, type Channel, streamCoverage, streamDurationSeconds } from "./activity-streams";
import { HR_ZONE_UPPER_FACTORS, POWER_ZONE_UPPER_FACTORS, zoneOf } from "./zone-factors";
import { type ProvenanceFields, provenanceOf } from "./strava-provenance";

/**
 * Deterministic analysis of ONE completed activity's streams. No model, no estimate and no default anchors:
 *
 *  - every metric is `null` (never 0, never a guess) when its inputs are missing or too thin;
 *  - IF/TSS need the athlete's own FTP, heart-rate zones need the athlete's own lactate-threshold HR; when an
 *    anchor is unknown the metric is not computed and `notes` says why;
 *  - the zone convention is the one the plan targets use (zone-factors.ts), so "Z4" means the same thing in a
 *    planned step and in the analysis of what was ridden;
 *  - Strava-origin and unknown-origin activities are refused (`ok:false`) before any number is computed
 *    (strava-provenance.ts): the analysis is a derived product and must not be built from restricted data.
 *
 * Pure module (no I/O) → tested without the Prisma engine. Formulas are the published definitions
 * (normalized power = 4th-root of the mean 4th power of the 30-s rolling mean; IF = NP/FTP;
 * TSS = duration × NP × IF / (FTP × 3600) × 100; aerobic decoupling = (EF1 − EF2)/EF1).
 */

export type AnalysisRefusal = "strava_restricted" | "unknown_provenance" | "no_streams" | "too_short";
export type AnalysisSport = "bike" | "run" | "swim" | "other";

export interface AnalysisAthlete { ftpW?: number | null; lthr?: number | null }
export interface AnalysisInput {
  streams: ActivityStreams | null | undefined;
  provenance: ProvenanceFields;
  athlete?: AnalysisAthlete;
  sport?: AnalysisSport;
}

export interface PowerSummary {
  avgW: number;
  /** Normalized power; null unless ≥ 20 min of power with ≥ 80% coverage. */
  npW: number | null;
  vi: number | null;
  intensityFactor: number | null;
  tss: number | null;
  /** Best sustained average power (W) by duration in seconds; absent when the activity or coverage is too short. */
  best: { seconds: number; avgW: number }[];
}
export interface HrSummary {
  avgBpm: number;
  maxBpm: number;
  /** Seconds in zones 1..7 (index 0 = zone 1); null without a known lactate-threshold HR. */
  secondsInZone: number[] | null;
}
export interface DecouplingResult {
  /** Positive = efficiency fell in the second half (output/HR dropped). */
  percent: number;
  basis: "power" | "speed";
  firstHalfEf: number;
  secondHalfEf: number;
}
export interface DetectedEffort {
  startS: number;
  durationS: number;
  channel: "power" | "hr";
  /** Mean of the channel over the effort (W or bpm). */
  avg: number;
  avgHrBpm: number | null;
  /** Zone of the mean value on the channel's own zone scale. */
  zone: number | null;
}
export interface StreamAnalysis {
  ok: true;
  durationS: number;
  sampleSeconds: number;
  coverage: Partial<Record<Channel, number | null>>;
  power: PowerSummary | null;
  hr: HrSummary | null;
  decoupling: DecouplingResult | null;
  efforts: DetectedEffort[];
  /** Plain-language reasons for every metric that was NOT computed, and limits of what was. */
  notes: string[];
  /** True when the underlying series was decimated or had rejected samples. */
  streamsReduced: boolean;
}
export type StreamAnalysisResult = StreamAnalysis | { ok: false; reason: AnalysisRefusal; message: string };

export const MIN_ANALYSIS_SECONDS = 120;
export const MIN_NP_SECONDS = 20 * 60;
export const MIN_DECOUPLING_SECONDS = 40 * 60;
export const MIN_COVERAGE = 0.8;
export const MIN_DECOUPLING_COVERAGE = 0.9;
export const BEST_EFFORT_SECONDS = [60, 300, 1200, 3600] as const;
export const MIN_EFFORT_SECONDS = 60;

const mean = (values: readonly number[]) => values.reduce((a, b) => a + b, 0) / values.length;
const round = (v: number, d = 1) => { const f = 10 ** d; return Math.round(v * f) / f; };
const positive = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v) && v > 0;

/**
 * 1 Hz series from the (possibly decimated) stream by linear interpolation. A grid second is `null` when the
 * surrounding samples are missing or are further apart than `maxGap` seconds, so a recording gap is never
 * bridged and a dropout is never turned into a number.
 */
export function resample1Hz(t: readonly number[], values: readonly (number | null)[], maxGap?: number): (number | null)[] {
  if (t.length < 2) return [];
  const steps = t.slice(1).map((v, i) => v - t[i]).sort((a, b) => a - b);
  const gap = maxGap ?? Math.max(10, 2.5 * steps[Math.floor(steps.length / 2)]);
  const total = Math.floor(t[t.length - 1] - t[0]) + 1;
  const out: (number | null)[] = new Array(total).fill(null);
  let j = 0;
  for (let s = 0; s < total; s++) {
    const time = t[0] + s;
    while (j < t.length - 2 && t[j + 1] < time) j++;
    const a = values[j], b = values[j + 1];
    const t0 = t[j], t1 = t[j + 1];
    if (a === null || b === null || t1 - t0 > gap) {
      // Exact hit on a valid sample is still valid even next to a gap.
      if (a !== null && time === t0) out[s] = a; else if (b !== null && time === t1) out[s] = b;
      continue;
    }
    out[s] = t1 === t0 ? a : a + (b - a) * ((time - t0) / (t1 - t0));
  }
  return out;
}

/** Rolling mean over a trailing window of `size` seconds; a window with < `minFill` valid seconds is null. */
export function rollingMean(series: readonly (number | null)[], size: number, minFill = 0.8, centered = false): (number | null)[] {
  const out: (number | null)[] = new Array(series.length).fill(null);
  const prefix = [0], count = [0];
  for (const v of series) { prefix.push(prefix[prefix.length - 1] + (v ?? 0)); count.push(count[count.length - 1] + (v === null ? 0 : 1)); }
  for (let i = 0; i < series.length; i++) {
    const lo = centered ? i - Math.floor(size / 2) : i - size + 1;
    const hi = centered ? lo + size - 1 : i;
    if (lo < 0 || hi >= series.length) continue;
    const n = count[hi + 1] - count[lo];
    if (n / size >= minFill && n > 0) out[i] = (prefix[hi + 1] - prefix[lo]) / n;
  }
  return out;
}

function normalizedPower(power: readonly (number | null)[]): number | null {
  const windows = rollingMean(power, 30).filter((v): v is number => v !== null);
  if (windows.length < MIN_NP_SECONDS) return null;
  return Math.pow(mean(windows.map(v => v ** 4)), 0.25);
}

function bestAverage(series: readonly (number | null)[], seconds: number): number | null {
  if (series.length < seconds) return null;
  let best: number | null = null;
  const windows = rollingMean(series, seconds, 0.95);
  for (const v of windows) if (v !== null && (best === null || v > best)) best = v;
  return best;
}

function detectEfforts(grid: { power: (number | null)[]; hr: (number | null)[] }, athlete: AnalysisAthlete, powerUsable: boolean, hrUsable: boolean): DetectedEffort[] {
  const ftp = athlete.ftpW, lthr = athlete.lthr;
  let channel: "power" | "hr" | null = null, anchor = 0, factors: readonly number[] = POWER_ZONE_UPPER_FACTORS;
  if (powerUsable && positive(ftp)) { channel = "power"; anchor = ftp; factors = POWER_ZONE_UPPER_FACTORS; }
  else if (hrUsable && positive(lthr)) { channel = "hr"; anchor = lthr; factors = HR_ZONE_UPPER_FACTORS; }
  if (!channel) return [];
  const series = grid[channel];
  const smooth = rollingMean(series, 11, 0.6, true);
  // Effort = sustained zone ≥ 4, i.e. above the zone-3 upper bound on this channel's own scale.
  const threshold = anchor * factors[3];
  const efforts: DetectedEffort[] = [];
  let start = -1, lastAbove = -1;
  const close = () => {
    if (start >= 0 && lastAbove - start + 1 >= MIN_EFFORT_SECONDS) {
      const raw = series.slice(start, lastAbove + 1).filter((v): v is number => v !== null);
      const hrs = grid.hr.slice(start, lastAbove + 1).filter((v): v is number => v !== null);
      if (raw.length) {
        const avg = mean(raw);
        efforts.push({ startS: start, durationS: lastAbove - start + 1, channel: channel!, avg: round(avg), avgHrBpm: hrs.length >= (lastAbove - start + 1) * 0.8 ? round(mean(hrs), 0) : null, zone: zoneOf(avg, anchor, factors) });
      }
    }
    start = -1; lastAbove = -1;
  };
  for (let i = 0; i < smooth.length; i++) {
    const v = smooth[i];
    if (v !== null && v > threshold) { if (start < 0) start = i; lastAbove = i; }
    else if (start >= 0 && i - lastAbove > 10) close();
  }
  close();
  return efforts;
}

function decoupling(grid: { power: (number | null)[]; hr: (number | null)[]; speed: (number | null)[] }, sport: AnalysisSport, notes: string[]): DecouplingResult | null {
  const total = grid.hr.length;
  if (total < MIN_DECOUPLING_SECONDS) { notes.push("Aerobic decoupling not computed: it needs a steady effort of at least 40 minutes."); return null; }
  const cov = (series: (number | null)[]) => series.filter(v => v !== null).length / total;
  const basis: "power" | "speed" | null = cov(grid.power) >= MIN_DECOUPLING_COVERAGE ? "power" : sport === "run" && cov(grid.speed) >= MIN_DECOUPLING_COVERAGE ? "speed" : null;
  if (!basis || cov(grid.hr) < MIN_DECOUPLING_COVERAGE) { notes.push("Aerobic decoupling not computed: it needs heart rate and power (or running speed) present for at least 90% of the activity."); return null; }
  const output = grid[basis];
  // Steady = the 60-s rolling output varies little. Intervals/surges make the ratio meaningless, so refuse.
  const rolled = rollingMean(output, 60, 0.8).filter((v): v is number => v !== null);
  const avg = mean(rolled);
  const cv = rolled.length && avg > 0 ? Math.sqrt(mean(rolled.map(v => (v - avg) ** 2))) / avg : Infinity;
  if (!(cv <= 0.15)) { notes.push("Aerobic decoupling not computed: the effort was not steady enough (output varied by more than 15%)."); return null; }
  const mid = Math.floor(total / 2);
  const ef = (lo: number, hi: number) => {
    const o: number[] = [], h: number[] = [];
    for (let i = lo; i < hi; i++) if (output[i] !== null && grid.hr[i] !== null) { o.push(output[i]!); h.push(grid.hr[i]!); }
    return o.length >= (hi - lo) * 0.8 && mean(h) > 0 ? mean(o) / mean(h) : null;
  };
  const first = ef(0, mid), second = ef(mid, total);
  if (first === null || second === null || first <= 0) { notes.push("Aerobic decoupling not computed: one half of the activity had too little paired data."); return null; }
  notes.push("Aerobic decoupling splits the whole recording at its midpoint; warm-up and cool-down are not removed.");
  return { percent: round(((first - second) / first) * 100, 2), basis, firstHalfEf: round(first, 4), secondHalfEf: round(second, 4) };
}

export function analyseStreams(input: AnalysisInput): StreamAnalysisResult {
  const origin = provenanceOf(input.provenance);
  if (origin === "strava") return { ok: false, reason: "strava_restricted", message: "Strava-origin activities are not analysed (Strava API terms restrict derived/AI analysis of Strava data)." };
  if (origin === "unknown") return { ok: false, reason: "unknown_provenance", message: "This activity's origin is not recorded, so it is not analysed." };
  const streams = input.streams;
  if (!streams || streams.t.length < 2) return { ok: false, reason: "no_streams", message: "No second-by-second data is stored for this activity." };
  const durationS = streamDurationSeconds(streams);
  if (durationS < MIN_ANALYSIS_SECONDS) return { ok: false, reason: "too_short", message: "The recording is too short to analyse." };

  const athlete = input.athlete ?? {};
  const sport = input.sport ?? "other";
  const notes: string[] = [];
  const coverage: Partial<Record<Channel, number | null>> = {};
  for (const c of streamCoverage(streams)) coverage[c.channel] = c.fraction === null ? null : round(c.fraction, 3);
  if (streams.reduced) notes.push(`The stored series was reduced (${streams.originalSampleCount} source samples, ${streams.t.length} kept${streams.droppedSamples ? `, ${streams.droppedSamples} rejected` : ""}); metrics are computed from the reduced series.`);

  const grid = { power: resample1Hz(streams.t, streams.power), hr: resample1Hz(streams.t, streams.hr), speed: resample1Hz(streams.t, streams.speedMs) };
  const gridCoverage = (s: (number | null)[]) => (s.length ? s.filter(v => v !== null).length / s.length : 0);
  const powerUsable = gridCoverage(grid.power) >= MIN_COVERAGE;
  const hrUsable = gridCoverage(grid.hr) >= MIN_COVERAGE;

  let power: PowerSummary | null = null;
  if (powerUsable) {
    const values = grid.power.filter((v): v is number => v !== null);
    const avgW = mean(values);
    const np = normalizedPower(grid.power);
    const ftp = athlete.ftpW;
    const ifactor = np !== null && positive(ftp) ? np / ftp : null;
    const tss = ifactor !== null && positive(ftp) && np !== null ? (durationS * np * ifactor) / (ftp * 3600) * 100 : null;
    if (np === null) notes.push("Normalized power, IF and TSS not computed: they need at least 20 minutes of power data.");
    else if (!positive(ftp)) notes.push("IF and TSS not computed: no FTP is recorded for this athlete.");
    power = {
      avgW: round(avgW), npW: np === null ? null : round(np), vi: np === null ? null : round(np / avgW, 3),
      intensityFactor: ifactor === null ? null : round(ifactor, 3), tss: tss === null ? null : round(tss),
      best: BEST_EFFORT_SECONDS.flatMap(seconds => { const v = bestAverage(grid.power, seconds); return v === null ? [] : [{ seconds, avgW: round(v) }]; }),
    };
  } else if (coverage.power != null && coverage.power > 0) notes.push("Power metrics not computed: power was present for less than 80% of the activity.");
  else notes.push("No power data in this activity.");

  let hr: HrSummary | null = null;
  if (hrUsable) {
    const values = grid.hr.filter((v): v is number => v !== null);
    let secondsInZone: number[] | null = null;
    if (positive(athlete.lthr)) {
      secondsInZone = [0, 0, 0, 0, 0, 0, 0];
      for (const v of values) { const z = zoneOf(v, athlete.lthr, HR_ZONE_UPPER_FACTORS); if (z) secondsInZone[z - 1]++; }
    } else notes.push("Heart-rate zones not computed: no lactate-threshold heart rate is recorded for this athlete.");
    hr = { avgBpm: round(mean(values), 0), maxBpm: Math.max(...values), secondsInZone };
  } else if (coverage.hr != null && coverage.hr > 0) notes.push("Heart-rate metrics not computed: heart rate was present for less than 80% of the activity.");
  else notes.push("No heart-rate data in this activity.");

  const dec = hrUsable ? decoupling(grid, sport, notes) : null;
  const efforts = detectEfforts(grid, athlete, powerUsable, hrUsable);
  if (!efforts.length && (powerUsable || hrUsable) && !(positive(athlete.ftpW) && powerUsable) && !(positive(athlete.lthr) && hrUsable)) notes.push("Hard efforts not detected: they need FTP (with power) or lactate-threshold heart rate (with heart rate).");

  return { ok: true, durationS: Math.round(durationS), sampleSeconds: grid.hr.length || grid.power.length, coverage, power, hr, decoupling: dec, efforts, notes, streamsReduced: streams.reduced };
}
