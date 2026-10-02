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

// All profile samples inside [from,to] (inclusive, clamped) — the fixed
// boundary-pair sampling missed hills between segment edges (Codex P1-10).
function samplesIn(profile: ProfilePoint[], from: number, to: number): ProfilePoint[] {
  const pts: ProfilePoint[] = [{ km: from, elevM: elevAt(profile, from) }];
  for (const p of profile) if (p.km > from + 1e-6 && p.km < to - 1e-6) pts.push(p);
  pts.push({ km: to, elevM: elevAt(profile, to) });
  return pts;
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
    // Per-sample time integration with TRUE distances (Codex follow-up F6):
    // samples closer than 5 m are merged — the old 0.01 km floor doubled the
    // traveled distance on dense tracks (1 km flat = 3.4 min at 5 m spacing).
    const raw = samplesIn(opts.profile, from, to);
    const pts: ProfilePoint[] = [raw[0]];
    for (const p of raw.slice(1))
      if (p.km - pts[pts.length - 1].km >= 0.005) pts.push(p);
    const segKm = Math.max(0.05, to - from);
    let tMin = 0, tSlow = 0, tFast = 0, powerW = 0, n = 0;
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1], b = pts[i];
      const subKm = b.km - a.km;
      if (subKm <= 0) continue; // true duplicates skip, never inflate
      const elevDelta = b.elevM - a.elevM; // SIGNED — descents count
      const r = bikePhysicsSpeedKmh({
        ftp: opts.ftp, weightKg: opts.weightKg, bikeKg: setup.bikeKg,
        elevGainM: elevDelta, distanceKm: subKm,
        venueElevM: opts.venueElevM ?? null, tempC: opts.tempC ?? null,
        windKph: windMean, cdA: setup.cdA,
      });
      const slow = bikePhysicsSpeedKmh({
        ftp: opts.ftp, weightKg: opts.weightKg, bikeKg: setup.bikeKg,
        elevGainM: elevDelta, distanceKm: subKm, venueElevM: opts.venueElevM ?? null,
        tempC: opts.tempC ?? null, windKph: windMean + gustDelta, cdA: setup.cdA,
      });
      const fast = bikePhysicsSpeedKmh({
        ftp: opts.ftp, weightKg: opts.weightKg, bikeKg: setup.bikeKg,
        elevGainM: elevDelta, distanceKm: subKm, venueElevM: opts.venueElevM ?? null,
        tempC: opts.tempC ?? null, windKph: Math.max(0, windMean - gustDelta / 2), cdA: setup.cdA,
      });
      tMin += (subKm / r.speedKmh) * 60;
      tSlow += (subKm / slow.speedKmh) * 60;
      tFast += (subKm / fast.speedKmh) * 60;
      powerW += r.powerW; n++;
    }
    if (!n) { tMin = tSlow = tFast = 0; n = 1; }
    const grade = gradeOf(pts[0], pts[pts.length - 1]);
    const r = { powerW: Math.round(powerW / n), speedKmh: segKm / (tMin / 60) };
    cum += tMin;
    cumFast += tFast;
    cumSlow += tSlow;
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
      `. Grades below −2% (steep descents) are modeled conservatively flat. Targets are holdable watts per segment, not surges.`,
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
  // Gust band (Codex follow-up F6: gustDelta was computed but unused): the
  // slow bound rides the gust speed, the fast bound assumes partial lulls.
  const slowAdj = Math.min(4, (windMean + gustDelta) * 0.08);
  const fastAdj = Math.min(3, Math.max(0, windMean - gustDelta / 2) * 0.08);
  const bounds = segmentBounds(opts.profile, opts.courseKm);
  const segments: SegmentRow[] = [];
  let cum = 0, cumSlow = 0, cumFast = 0;
  for (const [from, to] of bounds) {
    // TIME integration over each sample's own grade (Codex follow-up F6):
    // distance-weighting grades then applying the nonlinear factor canceled
    // climbs against descents — a rolling 8 km route predicted identical to
    // flat. Sum pace × distance per sample instead.
    const raw = samplesIn(opts.profile, from, to);
    const pts: ProfilePoint[] = [raw[0]];
    for (const p of raw.slice(1))
      if (p.km - pts[pts.length - 1].km >= 0.005) pts.push(p);
    const segKm = Math.max(0.05, to - from);
    let tMin = 0, tSlow = 0, tFast = 0;
    for (let i = 1; i < pts.length; i++) {
      const dx = pts[i].km - pts[i - 1].km;
      if (dx <= 0) continue;
      const g = gradeOf(pts[i - 1], pts[i]);
      const pace = opts.runPaceBaseSecPerKm * 1.06 * runGradeFactor(g);
      tMin += (pace * dx) / 60;
      tSlow += (pace * (1 + slowAdj / 100) * dx) / 60;
      tFast += (pace * (1 - fastAdj / 100) * dx) / 60;
    }
    if (!tMin) tMin = tSlow = tFast = 0;
    const grade = gradeOf(pts[0], pts[pts.length - 1]);
    const avgPace = tMin > 0 ? (tMin * 60) / segKm : opts.runPaceBaseSecPerKm * 1.06;
    cum += tMin;
    cumFast += tFast;
    cumSlow += tSlow;
    segments.push({
      fromKm: +from.toFixed(1),
      toKm: +to.toFixed(1),
      gradePct: +grade.toFixed(1),
      paceSecPerKm: Math.round(avgPace),
      windAdjPct: slowAdj > 0.2 ? +slowAdj.toFixed(1) : undefined,
      cumMin: +cum.toFixed(1),
    });
  }
  return {
    sport: "run",
    segments,
    totalMin: +cum.toFixed(1),
    gustRangeMin: [+cumFast.toFixed(1), +cumSlow.toFixed(1)],
    note:
      `Pace = threshold ×1.06 integrated per sample for grade` +
      (opts.tempC != null ? `. Air temp ${Math.round(opts.tempC)}°C is DISPLAYED ONLY — heat effects are not modeled in this table (see the forecast's WBGT factor)` : "") +
      (windMean > 3 ? `, wind ${Math.round(windMean)} km/h` : "") +
      (gustDelta > 0 ? ` gusting ${Math.round(opts.gustsKph!)}` : "") +
      `. Grade factors are coaching heuristics, not lab measurements.`,
  };
}

/** sec/km → display pace, CONVERTING for imperial (5:00/km ≈ 8:03/mi). */
export function fmtPaceSecPerKm(secPerKm: number, units: UnitSystem): string {
  const totalSec = Math.round(
    secPerKm * (units === "imperial" ? KM_PER_MI : 1),
  );
  // Rollover-safe: 299.7s rounds to 300 → "5:00", never "4:60".
  const m = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return `${m}:${String(sec).padStart(2, "0")}/${units === "imperial" ? "mi" : "km"}`;
}

export function fmtPacingRow(r: SegmentRow, units: UnitSystem): string {
  const from = units === "imperial" ? (r.fromKm / KM_PER_MI).toFixed(1) : r.fromKm.toFixed(1);
  const to = units === "imperial" ? (r.toKm / KM_PER_MI).toFixed(1) : r.toKm.toFixed(1);
  const u = units === "imperial" ? "mi" : "km";
  const pace = r.paceSecPerKm ? fmtPaceSecPerKm(r.paceSecPerKm, units) : null;
  return `${from}–${to} ${u}: ${r.gradePct > 0 ? "+" : ""}${r.gradePct}%` +
    (r.targetW ? ` · ${r.targetW} W · ${units === "imperial" ? (r.speedKmh! / KM_PER_MI).toFixed(1) : r.speedKmh} ${units === "imperial" ? "mph" : "km/h"}` : "") +
    (pace ? ` · ${pace}` : "") +
    ` · cum ${Math.floor(r.cumMin / 60)}:${String(Math.round(r.cumMin % 60)).padStart(2, "0")}`;
}
