/**
 * Per-sample data of ONE completed activity (what a watch records second by second).
 *
 * Honest-data rules, enforced by `normalizeStreams`:
 *  - a missing sample is `null`, never 0 (a power meter dropout is not "0 W", a strap dropout is not "0 bpm");
 *  - values outside physiological/instrument limits become `null` instead of being clamped or kept;
 *  - GPS coordinates are deliberately NOT part of this shape: they are location data JMM does not need to
 *    coach and would be the most sensitive thing stored about an athlete;
 *  - the series is capped (MAX_STREAM_POINTS) so storage stays bounded; the cap is applied by even
 *    decimation and the original sample count is kept so the reduction is visible.
 *
 * This module is pure (no I/O, no database) so it is testable without the Prisma engine.
 */

export const MAX_STREAM_POINTS = 3600;
/** Longest activity the stream pipeline accepts (seconds). Longer files are rejected, not truncated silently. */
export const MAX_ACTIVITY_SECONDS = 24 * 3600;
export const STREAM_SCHEMA_VERSION = 1;

export type Channel = "hr" | "power" | "cadence" | "speedMs" | "altitudeM" | "distanceM";
export const CHANNELS: readonly Channel[] = ["hr", "power", "cadence", "speedMs", "altitudeM", "distanceM"];

/** Inclusive plausibility ranges. Anything outside is treated as a sensor fault → null. */
export const CHANNEL_LIMITS: Record<Channel, readonly [number, number]> = {
  hr: [25, 250], power: [0, 2500], cadence: [0, 250], speedMs: [0, 45], altitudeM: [-500, 9000], distanceM: [0, 1_000_000],
};

export interface RawSample { t: number; hr?: unknown; power?: unknown; cadence?: unknown; speedMs?: unknown; altitudeM?: unknown; distanceM?: unknown }

export interface ActivityStreams {
  version: typeof STREAM_SCHEMA_VERSION;
  /** Seconds since the first sample, strictly increasing. */
  t: number[];
  hr: (number | null)[]; power: (number | null)[]; cadence: (number | null)[];
  speedMs: (number | null)[]; altitudeM: (number | null)[]; distanceM: (number | null)[];
  /** Samples in the source before decimation. */
  originalSampleCount: number;
  /** True when decimation or rejected samples reduced the data. */
  reduced: boolean;
  droppedSamples: number;
}

export interface StreamCoverage { channel: Channel; present: number; total: number; fraction: number | null }

const finite = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

/**
 * Builds validated streams from raw samples. Returns null when there is nothing usable (fewer than 2 samples
 * with distinct increasing times), so callers never store an empty or fabricated series.
 */
export function normalizeStreams(samples: readonly RawSample[], maxPoints = MAX_STREAM_POINTS): ActivityStreams | null {
  const clean = samples.filter(s => finite(s.t) && s.t >= 0).sort((a, b) => a.t - b.t);
  const unique: RawSample[] = [];
  for (const sample of clean) if (!unique.length || sample.t > unique[unique.length - 1].t) unique.push(sample);
  const dropped = samples.length - unique.length;
  if (unique.length < 2) return null;
  const origin = unique[0].t;
  if (unique[unique.length - 1].t - origin > MAX_ACTIVITY_SECONDS) return null;
  const stride = Math.max(1, Math.ceil(unique.length / Math.max(2, maxPoints)));
  const picked = unique.filter((_, i) => i % stride === 0 || i === unique.length - 1);
  const out: ActivityStreams = { version: STREAM_SCHEMA_VERSION, t: [], hr: [], power: [], cadence: [], speedMs: [], altitudeM: [], distanceM: [],
    originalSampleCount: samples.length, reduced: stride > 1 || dropped > 0, droppedSamples: dropped };
  for (const sample of picked) {
    out.t.push(Math.round((sample.t - origin) * 1000) / 1000);
    for (const channel of CHANNELS) {
      const value = sample[channel];
      const [lo, hi] = CHANNEL_LIMITS[channel];
      out[channel].push(finite(value) && value >= lo && value <= hi ? value : null);
    }
  }
  return out;
}

export function streamCoverage(streams: ActivityStreams): StreamCoverage[] {
  return CHANNELS.map(channel => {
    const present = streams[channel].filter(v => v !== null).length;
    return { channel, present, total: streams.t.length, fraction: streams.t.length ? present / streams.t.length : null };
  });
}

/** Channels with at least `min` fraction of valid samples. Used to decide what analysis is allowed to claim. */
export function usableChannels(streams: ActivityStreams, min = 0.8): Channel[] {
  return streamCoverage(streams).filter(c => c.fraction !== null && c.fraction >= min).map(c => c.channel);
}

export function streamDurationSeconds(streams: ActivityStreams): number {
  return streams.t.length ? streams.t[streams.t.length - 1] - streams.t[0] : 0;
}

/** Defensive parse of a stored JSON blob. Anything not matching the current schema is rejected, not coerced. */
export function parseStoredStreams(json: string | null | undefined): ActivityStreams | null {
  if (!json) return null;
  try {
    const value = JSON.parse(json) as Partial<ActivityStreams> | null;
    if (!value || value.version !== STREAM_SCHEMA_VERSION || !Array.isArray(value.t) || value.t.length < 2) return null;
    const n = value.t.length;
    for (const channel of CHANNELS) {
      const series = value[channel];
      if (!Array.isArray(series) || series.length !== n || series.some(v => v !== null && !finite(v))) return null;
    }
    if (value.t.some((v, i) => !finite(v) || (i > 0 && v <= (value.t as number[])[i - 1]))) return null;
    return value as ActivityStreams;
  } catch { return null; }
}
