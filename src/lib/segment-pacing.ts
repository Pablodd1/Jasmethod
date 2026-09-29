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
    // Per-sample integration: time over each profile sample inside the
    // segment (signed elevation change — descents run the physics too, the
    // solver clamps grades below −2% as unmodeled, stated in the note).
    const pts = samplesIn(opts.profile, from, to);
    const segKm = Math.max(0.05, to - from);
    let tMin = 0, tSlow = 0, tFast = 0, powerW = 0, n = 0;
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1], b = pts[i];
      const subKm = Math.max(0.01, b.km - a.km);
      const elevDelta = b.elevM - a.elevM; // SIGNED — descents count
      const r = bikePhysicsSpeedKmh({
        ftp: opts.ftp, weightKg: opts.weightKg ?? 70, bikeKg: setup.bikeKg,
        elevGainM: elevDelta, distanceKm: subKm,
        venueElevM: opts.venueElevM ?? null, tempC: opts.tempC ?? null,
        windKph: windMean, cdA: setup.cdA,
      });
      const slow = bikePhysicsSpeedKmh({
        ftp: opts.ftp, weightKg: opts.weightKg ?? 70, bikeKg: setup.bikeKg,
        elevGainM: elevDelta, distanceKm: subKm, venueElevM: opts.venueElevM ?? null,
        tempC: opts.tempC ?? null, windKph: windMean + gustDelta, cdA: setup.cdA,
      });
      const fast = bikePhysicsSpeedKmh({
        ftp: opts.ftp, weightKg: opts.weightKg ?? 70, bikeKg: setup.bikeKg,
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
  const bounds = segmentBounds(opts.profile, opts.courseKm);
  const segments: SegmentRow[] = [];
  let cum = 0, cumSlow = 0, cumFast = 0;
  for (const [from, to] of bounds) {
    // Distance-weighted grade over the samples inside the segment — boundary
    // pairs erased intermediate hills (Codex P1-10).
    const pts = samplesIn(opts.profile, from, to);
    const segKm = Math.max(0.05, to - from);
    let weighted = 0;
    for (let i = 1; i < pts.length; i++) {
      const w = Math.max(0.01, pts[i].km - pts[i - 1].km);
      weighted += gradeOf(pts[i - 1], pts[i]) * w;
    }
    const grade = weighted / segKm;
    const factor = runGradeFactor(grade);
    const pace = opts.runPaceBaseSecPerKm * 1.06 * factor; // threshold ×1.06 → race feel
    cum += (pace * segKm) / 60;
    cumFast += (pace * (1 - windAdj / 100) * segKm) / 60;
    cumSlow += (pace * (1 + windAdj / 100) * segKm) / 60;
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
      (opts.tempC != null ? `. Air temp ${Math.round(opts.tempC)}°C is DISPLAYED ONLY — heat effects are not modeled in this table (see the forecast's WBGT factor)` : "") +
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
