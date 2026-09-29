// Per-segment race pacing — the Best Bike Split-style table, honest edition.
// From the stored GPX elevation profile + athlete thresholds + race weather:
//   bike → per-segment target watts + expected speed (full physics: CdA, rho,
//          grade, mean wind; gusts feed a ± sensitivity band)
//   run  → per-segment pace from grade-cost factors (Minetti-style) + wind
// Every segment shows the model's assumptions; the uncertainty band comes
// from gust variance, not false precision.
import { bikePhysicsSpeedKmh, bikeSetupPhysics } from "./raceforecast";
import type { UnitSystem } from "./units";

export interface ProfilePoint {
  km: number;
  elevM: number;
}

export interface SegmentRow {
  fromKm: number;
  toKm: number;
  gradePct: number; // signed, +up
  // bike
  targetW?: number;
  speedKmh?: number;
  // run
  paceSecPerKm?: number;
  // shared
  windAdjPct?: number; // gust sensitivity ±% on this segment's time
  cumMin: number; // cumulative minutes at segment end (mean-wind scenario)
}

export interface PacingTable {
  sport: "bike" | "run";
  segments: SegmentRow[];
  totalMin: number;
  gustRangeMin: [number, number]; // [fast, slow] total-time bounds from gusts
  cdaUsed?: number;
  note: string;
}

const KM_PER_MI = 1.609344;

function gradeOf(a: ProfilePoint, b: ProfilePoint): number {
  const dx = (b.km - a.km) * 1000;
  if (dx < 10) return 0;
  return ((b.elevM - a.elevM) / dx) * 100; // percent
}

// Segment count scales with distance: ~1 per km, capped for payload size.
function segmentBounds(profile: ProfilePoint[], totalKm: number): [number, number][] {
  const target = Math.min(40, Math.max(8, Math.round(totalKm)));
  const bounds: [number, number][] = [];
  const step = totalKm / target;
  for (let i = 0; i < target; i++) {
    bounds.push([i * step, Math.min(totalKm, (i + 1) * step)]);
  }
  return bounds;
}

function elevAt(profile: ProfilePoint[], km: number): number {
  if (!profile.length) return 0;
  if (km <= profile[0].km) return profile[0].elevM;
  for (let i = 1; i < profile.length; i++) {
    if (profile[i].km >= km) {
      const a = profile[i - 1], b = profile[i];
      const t = b.km === a.km ? 0 : (km - a.km) / (b.km - a.km);
      return a.elevM + t * (b.elevM - a.elevM);
    }
  }
  return profile[profile.length - 1].elevM;
}

export function buildBikePacing(opts: {
  profile: ProfilePoint[];
  courseKm: number;
  ftp: number;
  weightKg?: number | null;
  bikeType?: string | null;
  hasAeroBars?: boolean | null;
  tempC?: number | null;
  windKph?: number | null;
  gustsKph?: number | null;
  venueElevM?: number | null;
  units?: UnitSystem;
}): PacingTable {
  const setup = bikeSetupPhysics({ bikeType: opts.bikeType, hasAeroBars: opts.hasAeroBars });
  const windMean = opts.windKph ?? 0;
  const gustDelta = Math.max(0, (opts.gustsKph ?? windMean) - windMean);
  const bounds = segmentBounds(opts.profile, opts.courseKm);
  const segments: SegmentRow[] = [];
  let cum = 0;
  let cumFast = 0, cumSlow = 0;
  for (const [from, to] of bounds) {
    const a: ProfilePoint = { km: from, elevM: elevAt(opts.profile, from) };
    const b: ProfilePoint = { km: to, elevM: elevAt(opts.profile, to) };
    const segKm = Math.max(0.05, to - from);
    const grade = gradeOf(a, b);
    const elevGainM = Math.max(0, b.elevM - a.elevM);
    const r = bikePhysicsSpeedKmh({
      ftp: opts.ftp,
      weightKg: opts.weightKg ?? 70,
      bikeKg: setup.bikeKg,
      elevGainM,
      distanceKm: segKm,
      venueElevM: opts.venueElevM ?? null,
      tempC: opts.tempC ?? null,
      windKph: windMean,
      cdA: setup.cdA,
    });
    const tMin = (segKm / r.speedKmh) * 60;
    // Gust sensitivity: recompute with mean+gust headwind assumption (worst
    // case) and mean-gust/2 tailwind-assist (best case) as the honest band.
    const slow = bikePhysicsSpeedKmh({
      ftp: opts.ftp, weightKg: opts.weightKg ?? 70, bikeKg: setup.bikeKg,
      elevGainM, distanceKm: segKm, venueElevM: opts.venueElevM ?? null,
      tempC: opts.tempC ?? null, windKph: windMean + gustDelta, cdA: setup.cdA,
    });
    const fast = bikePhysicsSpeedKmh({
      ftp: opts.ftp, weightKg: opts.weightKg ?? 70, bikeKg: setup.bikeKg,
      elevGainM, distanceKm: segKm, venueElevM: opts.venueElevM ?? null,
      tempC: opts.tempC ?? null, windKph: Math.max(0, windMean - gustDelta / 2), cdA: setup.cdA,
    });
    cum += tMin;
    cumFast += (segKm / fast.speedKmh) * 60;
    cumSlow += (segKm / slow.speedKmh) * 60;
    segments.push({
      fromKm: +from.toFixed(1),
      toKm: +to.toFixed(1),
      gradePct: +grade.toFixed(1),
      targetW: r.powerW,
      speedKmh: +r.speedKmh.toFixed(1),
      windAdjPct: gustDelta > 0 ? +(((cumSlow - cumFast) / Math.max(1, cum)) * 100).toFixed(1) : undefined,
      cumMin: +cum.toFixed(1),
    });
  }
  return {
    sport: "bike",
    segments,
    totalMin: +cum.toFixed(1),
    gustRangeMin: [+cumFast.toFixed(1), +cumSlow.toFixed(1)],
    cdaUsed: setup.cdA,
    note:
      `Physics: CdA ${setup.cdA} (${opts.bikeType || "road"}${opts.hasAeroBars ? "+aero" : ""}), ` +
      `${opts.tempC != null ? `${Math.round(opts.tempC)}°C, ` : ""}mean wind ${Math.round(windMean)} km/h` +
      (gustDelta > 0 ? `, gusts to ${Math.round((opts.gustsKph ?? windMean))} km/h` : "") +
      `. Targets are holdable watts per segment, not surges.`,
  };
}

// Run grade-cost: pace multiplier vs flat (empirical coaching factors —
// uphill costs more than downhill saves; labeled as model, not measurement).
function runGradeFactor(gradePct: number): number {
  const g = Math.max(-15, Math.min(20, gradePct));
  if (g >= 0) return 1 + g * 0.032; // +3.2% time per % grade (up to +64% at 20%)
  return 1 + g * 0.018; // downhill saves ~1.8%/−1% grade, diminishing
}

export function buildRunPacing(opts: {
  profile: ProfilePoint[];
  courseKm: number;
  runPaceBaseSecPerKm: number; // threshold pace sec/km
  windKph?: number | null;
  gustsKph?: number | null;
  tempC?: number | null;
}): PacingTable {
  const windMean = opts.windKph ?? 0;
  const gustDelta = Math.max(0, (opts.gustsKph ?? windMean) - windMean);
  // Wind cost on running ≈ v² drag share; a simple honest heuristic: up to ±3%.
  const windAdj = Math.min(3, windMean * 0.08);
  const bounds = segmentBounds(opts.profile, opts.courseKm);
  const segments: SegmentRow[] = [];
  let cum = 0, cumSlow = 0, cumFast = 0;
  for (const [from, to] of bounds) {
    const a: ProfilePoint = { km: from, elevM: elevAt(opts.profile, from) };
    const b: ProfilePoint = { km: to, elevM: elevAt(opts.profile, to) };
    const segKm = Math.max(0.05, to - from);
    const grade = gradeOf(a, b);
    const factor = runGradeFactor(grade);
    const pace = opts.runPaceBaseSecPerKm * 1.06 * factor; // threshold ×1.06 → race feel
    cum += (pace * segKm) / 60;
    cumFast += ((pace * (1 - windAdj / 100) * segKm) / 60);
    cumSlow += ((pace * (1 + windAdj / 100) * segKm) / 60);
    segments.push({
      fromKm: +from.toFixed(1),
      toKm: +to.toFixed(1),
      gradePct: +grade.toFixed(1),
      paceSecPerKm: Math.round(pace),
      windAdjPct: windAdj > 0.2 ? +windAdj.toFixed(1) : undefined,
      cumMin: +cum.toFixed(1),
    });
  }
  return {
    sport: "run",
    segments,
    totalMin: +cum.toFixed(1),
    gustRangeMin: [+cumFast.toFixed(1), +cumSlow.toFixed(1)],
    note:
      `Pace = threshold ×1.06 adjusted per-segment for grade` +
      (opts.tempC != null ? `, ${Math.round(opts.tempC)}°C` : "") +
      (windMean > 3 ? `, wind ${Math.round(windMean)} km/h (±${windAdj.toFixed(1)}% band)` : "") +
      `. Grade factors are coaching heuristics, not lab measurements.`,
  };
}

export function fmtPacingRow(r: SegmentRow, units: UnitSystem): string {
  const from = units === "imperial" ? (r.fromKm / KM_PER_MI).toFixed(1) : r.fromKm.toFixed(1);
  const to = units === "imperial" ? (r.toKm / KM_PER_MI).toFixed(1) : r.toKm.toFixed(1);
  const u = units === "imperial" ? "mi" : "km";
  const pace = r.paceSecPerKm
    ? `${Math.floor(r.paceSecPerKm / 60)}:${String(Math.round(r.paceSecPerKm % 60)).padStart(2, "0")}/${units === "imperial" ? "mi" : "km"}`
    : null;
  return `${from}–${to} ${u}: ${r.gradePct > 0 ? "+" : ""}${r.gradePct}%` +
    (r.targetW ? ` · ${r.targetW} W · ${units === "imperial" ? (r.speedKmh! / KM_PER_MI).toFixed(1) : r.speedKmh} ${units === "imperial" ? "mph" : "km/h"}` : "") +
    (pace ? ` · ${pace}` : "") +
    ` · cum ${Math.floor(r.cumMin / 60)}:${String(Math.round(r.cumMin % 60)).padStart(2, "0")}`;
}
