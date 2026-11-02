// JasMiamiMethod — Performance Engine (deterministic, pure, no I/O).
//
// 1. Multi-wearable autonomic normalization (Whoop / Oura / Garmin / Apple /
//    manual) with a check-in fallback. Strava carries activity load only — it
//    never supplies an autonomic signal.
// 2. CENTRAL (autonomic: lnRMSSD 7-day rolling vs 30–60-day baseline ± SWC,
//    RHR delta, sleep) is scored separately from PERIPHERAL (soreness +
//    decayed 48 h eccentric/musculoskeletal load).
// 3. Verdict: rest | easy | modulate | planned | push. PUSH (controlled
//    overload toward supercompensation) requires every gate to pass; unknown
//    is never treated as "good" (honest-data doctrine).
// 4. Sport-specific biomechanical gating + T_avail density scaling produce the
//    exact step list. The AI coach only narrates this output.
//
// References: Plews 2012/2013 (lnRMSSD 7-day rolling, SWC = 0.5 × SD),
// Buchheit 2014 (HRV/RHR monitoring), Foster 2001 (session-RPE load),
// Gabbett 2016 (ACWR), Rønnestad 2015/2020 (30/15 short intervals),
// Clarkson & Hubal 2002 / Howatson 2008 (eccentric damage time-course),
// Seiler 2010 (intensity distribution), Wallace 2014 (sRPE).

import type { WorkoutStep } from "./prescription";
import { qualityFor, doseScale, repsFor, maxKeySessions, type GoalFamily, type CyclePhase, type Level, type QualityKind } from "./periodization";

// ---------------- Types ----------------
export type WearableSource = "whoop" | "oura" | "garmin" | "apple" | "manual" | "strava" | "checkin";
export type EngineVerdict = "rest" | "easy" | "modulate" | "planned" | "push";
export type StimulusKind = QualityKind | "recovery" | "planned";

export interface MetricRow {
  date: Date | string;
  hrv?: number | null;
  hrvType?: string | null;
  restingHr?: number | null;
  rhr?: number | null;
  sleepHours?: number | null;
  source?: string | null;
}

export interface LoadRow {
  date: Date | string;
  sport: string;
  type?: string | null;
  intensity?: string | null;
  rpe?: number | null;
  minutes: number | null; // actual minutes; null = unknown (never zero)
}

export interface SubjectiveInput {
  sleep?: number; soreness?: number; energy?: number; stress?: number; mood?: number; // 1–5
  sessionFelt?: "easier" | "normal" | "harder";
  newPain?: boolean; sick?: boolean;
}

export interface CentralState {
  source: WearableSource;
  confidence: "device" | "subjective" | "none";
  hrvZ: number | null;          // (7-day lnRMSSD − baseline mean) / baseline SD
  swcLn: number | null;         // 0.5 × baseline SD (ln units)
  acuteDropZ: number | null;    // today's lnRMSSD vs baseline (single-day crash detector)
  rhrDelta: number | null;      // today − baseline mean, bpm
  sleepHours: number | null;
  status: "suppressed" | "stable" | "elevated" | "unknown";
  score: number | null;         // 0–100
  reasons: string[];
}

export interface PeripheralState {
  soreness: number | null;      // 1–5 as reported
  eccentric48h: number;         // decayed eccentric units
  eccentricBand: "low" | "moderate" | "high";
  hoursSinceHighEccentric: number | null;
  status: "fresh" | "loaded" | "high";
  score: number;                // 0–100
}

export interface LoadState {
  acute7: number | null; chronic28: number | null; acwr: number | null;
  coverageDays: number; unknownRows: number;
}

export interface PerformanceDecision {
  version: "perf-engine-v1";
  verdict: EngineVerdict;
  readiness: number | null;
  central: CentralState;
  peripheral: PeripheralState;
  load: LoadState;
  rpeDelta: number | null;
  pushBlockedBy: string[];
  message: string;
}

// ---------------- Helpers ----------------
const DAY = 86400000;
const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));
const t = (d: Date | string) => +new Date(d);
const mean = (a: number[]) => a.reduce((s, n) => s + n, 0) / a.length;
const sd = (a: number[]) => { const m = mean(a); return Math.sqrt(a.reduce((s, n) => s + (n - m) ** 2, 0) / Math.max(1, a.length - 1)); };
const zoneNum = (z?: string | null) => clamp(Number(String(z || "z2").replace(/[^0-9]/g, "")) || 2, 1, 7);
/** RPE expected for a zone — same table as prescription.zoneTargets. */
export const ZONE_RPE = [0, 2, 3, 5, 7, 8, 9, 10];
/** Approximate intensity factor per zone for an *estimated* TSS label. */
const ZONE_IF = [0, 0.55, 0.7, 0.83, 0.95, 1.05, 1.15, 1.2];

export function normalizeSource(raw?: string | null): WearableSource | null {
  const s = String(raw || "").toLowerCase().trim();
  if (!s) return null;
  if (s === "aura" || s.startsWith("oura")) return "oura"; // schema comment uses "aura"
  if (s.startsWith("whoop")) return "whoop";
  if (s.startsWith("garmin")) return "garmin";
  if (s === "apple" || s.startsWith("apple") || s === "healthkit") return "apple";
  if (s.startsWith("strava")) return "strava";
  if (s === "manual" || s === "athlete-reported") return "manual";
  return null;
}
// Overnight-HRV quality priority. Strava has no autonomic data.
const AUTONOMIC_PRIORITY: WearableSource[] = ["whoop", "oura", "garmin", "apple", "manual"];

// ---------------- 1. CENTRAL (autonomic) ----------------
export function normalizeCentral(metrics: MetricRow[], subjective: SubjectiveInput, now = new Date()): CentralState {
  const nowT = +now, todayFloor = nowT - 36 * 3600000; // a "today" reading = last 36 h
  const valid = metrics
    .map(m => ({ ...m, src: normalizeSource(m.source), ts: t(m.date) }))
    .filter(m => m.src && m.src !== "strava" && m.ts <= nowT);

  for (const src of AUTONOMIC_PRIORITY) {
    const rows = valid.filter(m => m.src === src).sort((a, b) => a.ts - b.ts);
    const hrvRows = rows.filter(m => m.hrv != null && m.hrv > 0 && m.hrv <= 300 && (m.hrvType || "rmssd") === "rmssd");
    const latest = hrvRows[hrvRows.length - 1];
    if (!latest || latest.ts < todayFloor) continue;
    const ln = (r: typeof latest) => Math.log(r.hrv!);
    const rolling = hrvRows.filter(r => r.ts > nowT - 7 * DAY).map(ln);
    const baseline = hrvRows.filter(r => r.ts <= nowT - 7 * DAY && r.ts > nowT - 60 * DAY).map(ln);
    if (rolling.length < 4 || baseline.length < 14) continue; // insufficient → try next source
    const bMean = mean(baseline), bSd = Math.max(sd(baseline), 0.02);
    const hrvZ = (mean(rolling) - bMean) / bSd, swcLn = 0.5 * bSd;
    const acuteDropZ = (ln(latest) - bMean) / bSd;

    const rhrOf = (r: MetricRow) => r.restingHr ?? r.rhr ?? null;
    const rhrRows = rows.filter(r => rhrOf(r) != null);
    const rhrToday = rhrRows.length && rhrRows[rhrRows.length - 1].ts >= todayFloor ? rhrOf(rhrRows[rhrRows.length - 1])! : null;
    const rhrBase = rhrRows.filter(r => r.ts <= nowT - DAY && r.ts > nowT - 60 * DAY).map(r => rhrOf(r)!);
    const rhrDelta = rhrToday != null && rhrBase.length >= 7 ? Math.round((rhrToday - mean(rhrBase)) * 10) / 10 : null;
    const sleepRow = rows.filter(r => r.sleepHours != null && r.ts >= todayFloor).pop();
    const sleepHours = sleepRow?.sleepHours ?? null;

    const reasons: string[] = [];
    let status: CentralState["status"] = "stable";
    if (mean(rolling) < bMean - swcLn) { status = "suppressed"; reasons.push("7-day lnRMSSD below SWC"); }
    else if (mean(rolling) > bMean + swcLn) status = "elevated";
    if (acuteDropZ <= -1.5) { status = "suppressed"; reasons.push("acute single-day HRV drop"); }
    // Elevated HRV with a rising pulse can reflect parasympathetic saturation/overreaching.
    if (status === "elevated" && rhrDelta != null && rhrDelta > 5) { status = "suppressed"; reasons.push("HRV up with RHR up"); }

    let score = 70 + 15 * clamp(hrvZ, -2, 1.5);
    if (rhrDelta != null && rhrDelta > 2) score -= 3 * (rhrDelta - 2);
    if (sleepHours != null) score += sleepHours < 5 ? -20 : sleepHours < 6 ? -10 : sleepHours >= 7.5 ? 5 : 0;
    if (acuteDropZ <= -1.5) score -= 15;
    return { source: src, confidence: "device", hrvZ: round1(hrvZ), swcLn: round3(swcLn), acuteDropZ: round1(acuteDropZ), rhrDelta, sleepHours, status, score: Math.round(clamp(score, 0, 100)), reasons };
  }

  // Graceful degradation: subjective markers (Saw 2016 — self-report is as sensitive as objective markers).
  const { sleep, energy, stress, mood } = subjective;
  if ([sleep, energy, stress].every(v => typeof v === "number")) {
    let score = 55 + (sleep! - 3) * 10 + (energy! - 3) * 9 - (stress! - 3) * 7 + (typeof mood === "number" ? (mood - 3) * 3 : 0);
    score = Math.round(clamp(score, 0, 100));
    return { source: "checkin", confidence: "subjective", hrvZ: null, swcLn: null, acuteDropZ: null, rhrDelta: null, sleepHours: null,
      status: score < 45 ? "suppressed" : "stable", score, reasons: ["no qualifying wearable baseline; check-in used"] };
  }
  return { source: "checkin", confidence: "none", hrvZ: null, swcLn: null, acuteDropZ: null, rhrDelta: null, sleepHours: null, status: "unknown", score: null, reasons: ["no autonomic or subjective data"] };
}

// ---------------- 2. PERIPHERAL (mechanical) ----------------
const ECCENTRIC_WEIGHT: Record<string, number> = { run: 1, plyo: 1, hyrox: 0.9, brick: 0.8, boxing: 0.5, strength: 0.7, bike: 0.15, swim: 0.05, mobility: 0, recovery: 0 };
const INTENSITY_FACTOR = [0, 0.5, 0.7, 1, 1.4, 1.8, 2, 2];
export function isHighEccentric(r: LoadRow): boolean {
  const w = ECCENTRIC_WEIGHT[r.sport] ?? 0.5;
  if (w < 0.5) return false;
  const z = zoneNum(r.intensity);
  return z >= 4 || (r.rpe ?? 0) >= 7 || ["interval", "threshold", "plyo", "power"].includes(String(r.type)) || (r.sport === "strength" && (r.rpe ?? 0) >= 6);
}
/** A key (hard) session for the polarized guard: Z4+, interval/threshold type, or RPE ≥7 — any sport. */
export function isKeySession(r: LoadRow): boolean {
  return zoneNum(r.intensity) >= 4 || ["interval", "threshold", "race", "test"].includes(String(r.type)) || (r.rpe ?? 0) >= 7;
}
export function normalizePeripheral(rows: LoadRow[], soreness: number | null | undefined, now = new Date()): PeripheralState {
  const nowT = +now;
  let ecc = 0, lastHigh: number | null = null;
  for (const r of rows) {
    const ts = t(r.date), hours = (nowT - ts) / 3600000;
    if (hours < 0 || hours > 72) continue;
    if (isHighEccentric(r)) lastHigh = lastHigh == null ? hours : Math.min(lastHigh, hours);
    if (hours > 48 || r.minutes == null) continue;
    const intensity = r.rpe != null ? r.rpe / 5 : INTENSITY_FACTOR[zoneNum(r.intensity)];
    ecc += (ECCENTRIC_WEIGHT[r.sport] ?? 0.5) * r.minutes * intensity * (1 - hours / 72);
  }
  ecc = Math.round(ecc);
  const band = ecc >= 60 ? "high" : ecc >= 25 ? "moderate" : "low";
  const s = typeof soreness === "number" ? soreness : null;
  const status: PeripheralState["status"] = (s != null && s >= 4) || band === "high" ? "high" : (s != null && s >= 3) || band === "moderate" ? "loaded" : "fresh";
  const score = Math.round(clamp(100 - (s != null ? (s - 1) * 15 : 15) - ecc * 0.4, 0, 100));
  return { soreness: s, eccentric48h: ecc, eccentricBand: band, hoursSinceHighEccentric: lastHigh == null ? null : Math.round(lastHigh), status, score };
}

// ---------------- 3. LOAD (session-RPE ACWR) ----------------
export function computeLoad(rows: LoadRow[], now = new Date()): LoadState {
  const nowT = +now;
  const inWindow = rows.filter(r => t(r.date) <= nowT && t(r.date) > nowT - 28 * DAY);
  const unknownRows = inWindow.filter(r => r.minutes == null).length;
  const sRpe = (r: LoadRow) => r.minutes! * (r.rpe ?? ZONE_RPE[zoneNum(r.intensity)]);
  const known = inWindow.filter(r => r.minutes != null);
  const oldest = known.length ? Math.min(...known.map(r => t(r.date))) : nowT;
  const coverageDays = Math.floor((nowT - oldest) / DAY);
  const acute = known.filter(r => t(r.date) > nowT - 7 * DAY).reduce((s, r) => s + sRpe(r), 0);
  const chronic = known.reduce((s, r) => s + sRpe(r), 0) / 4;
  // Unknown durations or < 21 days of history → ACWR unknown (never assumed 1.0).
  const acwr = coverageDays >= 21 && chronic > 0 && unknownRows === 0 ? Math.round((acute / chronic) * 100) / 100 : null;
  return { acute7: Math.round(acute), chronic28: Math.round(chronic), acwr, coverageDays, unknownRows };
}

export function recentRpeDelta(rows: LoadRow[], now = new Date()): number | null {
  const d = rows.filter(r => r.rpe != null && t(r.date) > +now - 7 * DAY && t(r.date) <= +now)
    .sort((a, b) => t(b.date) - t(a.date)).slice(0, 3)
    .map(r => r.rpe! - ZONE_RPE[zoneNum(r.intensity)]);
  return d.length ? round1(mean(d)) : null;
}

// ---------------- 4. VERDICT ----------------
export const PUSH_READINESS = 75, PUSH_ACWR_MAX = 1.3, NEUROMUSCULAR_READINESS = 70, ECCENTRIC_SPACING_H = 48;

export function decidePerformance(input: {
  base: { verdict: string; safetyStatus?: string; score?: number; scoreAvailable?: boolean };
  subjective: SubjectiveInput;
  metrics: MetricRow[];
  loadRows: LoadRow[];
  pushEnabled: boolean;
  now?: Date;
  /** Quality-over-quantity guard (polarized distribution). Absent → no weekly cap applied. */
  quality?: { level: Level; phase?: CyclePhase; plannedHard: boolean; nextDayKey: boolean | null };
}): PerformanceDecision {
  const now = input.now ?? new Date();
  const central = normalizeCentral(input.metrics, input.subjective, now);
  const peripheral = normalizePeripheral(input.loadRows, input.subjective.soreness, now);
  const load = computeLoad(input.loadRows, now);
  let rpeDelta = recentRpeDelta(input.loadRows, now);
  if (rpeDelta == null && input.subjective.sessionFelt === "harder") rpeDelta = 1.5;
  const base = input.base;
  const subjectiveScore = base.scoreAvailable === false ? null : base.score ?? null;

  // Readiness composite: central weighted highest when device-backed.
  let readiness: number | null = null;
  if (central.confidence === "device" && central.score != null)
    readiness = Math.round(0.55 * central.score + 0.25 * peripheral.score + 0.2 * (subjectiveScore ?? central.score));
  else if (subjectiveScore != null)
    readiness = Math.round(0.7 * subjectiveScore + 0.3 * peripheral.score);

  const blocked: string[] = [];
  let verdict: EngineVerdict;
  const mk = (v: EngineVerdict, message: string): PerformanceDecision => ({ version: "perf-engine-v1", verdict: v, readiness, central, peripheral, load, rpeDelta, pushBlockedBy: blocked, message });

  // The safety resolver and every upstream hold are absolute floors.
  if (base.safetyStatus && base.safetyStatus !== "clear") return mk("rest", "Safety hold active — no engine change.");
  if (base.verdict === "rest") return mk("rest", "Rest verdict retained.");
  if (base.verdict === "easy") return mk("easy", "Easy verdict retained.");
  verdict = base.verdict === "trim" ? "modulate" : "planned";

  // Subjective-only central state is already inside the check-in score; only a
  // device-backed autonomic signal may lower the verdict further (no double counting).
  if (central.status === "suppressed" && central.confidence === "device") {
    verdict = central.hrvZ != null && central.hrvZ <= -1.5 ? "easy" : "modulate";
    return mk(verdict, `Central fatigue: ${central.reasons.join(", ") || "low readiness"}.`);
  }

  // PUSH gates — every one must pass; unknown blocks.
  if (!input.pushEnabled) blocked.push("push engine disabled");
  if (base.verdict !== "full") blocked.push("check-in verdict not full");
  if (readiness == null || readiness < PUSH_READINESS) blocked.push(`readiness ${readiness ?? "unknown"} < ${PUSH_READINESS}`);
  if (load.acwr == null) blocked.push("ACWR unknown (<21 d history or unknown durations)");
  else if (load.acwr >= PUSH_ACWR_MAX) blocked.push(`ACWR ${load.acwr} ≥ ${PUSH_ACWR_MAX}`);
  if (central.confidence === "none") blocked.push("no readiness data");
  if (central.status === "suppressed") blocked.push("central readiness suppressed");
  if (rpeDelta != null && rpeDelta >= 1.5) blocked.push(`RPE running hot (+${rpeDelta})`);
  if (central.rhrDelta != null && central.rhrDelta > 5) blocked.push(`RHR +${central.rhrDelta} bpm`);
  if (input.subjective.newPain || input.subjective.sick) blocked.push("pain/illness reported");

  const q = input.quality;
  if (q) {
    const keys = input.loadRows.filter(r => isKeySession(r) && t(r.date) <= +now && t(r.date) > +now - 7 * DAY);
    const lastKeyH = keys.length ? Math.round((+now - Math.max(...keys.map(r => t(r.date)))) / 3600000) : null;
    if (q.phase === "taper" || q.phase === "race" || q.phase === "recovery") blocked.push(`${q.phase} phase: no overload`);
    if (lastKeyH != null && lastKeyH < 36) blocked.push(`key session ${lastKeyH} h ago (no back-to-back hard days)`);
    if (!q.plannedHard && keys.length >= maxKeySessions(q.level)) blocked.push(`${keys.length} key sessions in 7 d (cap ${maxKeySessions(q.level)}): keep easy days easy`);
    if (!q.plannedHard && q.nextDayKey === true) blocked.push("key session planned tomorrow");
  }
  if (!blocked.length) return mk("push", `PUSH: readiness ${readiness}, ACWR ${load.acwr}, central ${central.status}.`);
  return mk(verdict, verdict === "planned" ? "Execute the planned session." : "Modulated: keep intent, trim volume.");
}

// ---------------- 5. SPORT GATING + GOAL/PHASE QUALITY ----------------
export interface PlanContext {
  family: GoalFamily; phase: CyclePhase; level: Level;
  weekInPhase?: number | null; chronicLoad?: number | null; daySeed: number;
}
export interface Stimulus {
  sport: string; kind: StimulusKind; zone: string; pivotedFrom?: string; reason: string;
  reps?: number; family?: GoalFamily; phase?: CyclePhase;
}

const KIND_ZONE: Record<string, string> = { vo2: "z5", "vo2-long": "z5", threshold: "z4", sweetspot: "z3", "race-pace": "z4", durability: "z4", "taper-primer": "z4", neuromuscular: "z5", compromised: "z4", aerobic: "z2" };

export function selectStimulus(input: {
  planned: { sport: string; type: string; intensity?: string | null; durationMin: number };
  decision: PerformanceDecision;
  availMin: number;
  availableSports: string[]; // modalities the athlete actually has (from plan history/equipment)
  raceBuild?: boolean;       // HYROX/multisport race-specific block
  plan?: PlanContext;        // goal × phase × level; absent → time-only legacy choice
}): Stimulus {
  const base = selectSportStimulus(input);
  const plan = input.plan;
  if (!plan) return base;
  const out: Stimulus = { ...base, family: plan.family, phase: plan.phase };
  const z = zoneNum(input.planned.intensity), plannedHard = z >= 4 || ["interval", "threshold"].includes(input.planned.type);
  // Taper / race week: a planned key session keeps intensity, loses volume. Never a new stimulus.
  if ((plan.phase === "taper" || plan.phase === "race") && plannedHard && out.kind !== "aerobic")
    return { ...out, kind: "taper-primer", zone: "z4", reps: repsFor("taper-primer", doseScale(plan)), reason: `${plan.phase} phase: keep intensity, cut volume (Bosquet 2007).` };
  if (input.decision.verdict !== "push" || out.kind === "planned" || out.kind === "aerobic") return out;
  // PUSH: choose the stimulus from goal × phase × level, on the (possibly pivoted) sport.
  const q = qualityFor({ family: plan.family, phase: plan.phase, sport: out.sport, level: plan.level, availMin: input.availMin, daySeed: plan.daySeed });
  let kind: StimulusKind = q.kind;
  if (out.kind === "compromised" && out.sport === "hyrox") kind = q.kind === "neuromuscular" || q.kind === "vo2-long" || q.kind === "race-pace" ? q.kind : "compromised";
  if (out.sport === "strength" && out.kind !== "neuromuscular") kind = "threshold"; // NM gate closed upstream
  if (out.kind === "sweetspot" && (kind === "vo2" || kind === "vo2-long")) kind = "sweetspot"; // high soreness on bike caps at sweet spot
  return { ...out, kind, zone: KIND_ZONE[kind] || out.zone, reps: repsFor(kind as QualityKind, doseScale(plan)), reason: `${out.reason} ${q.reason}.` };
}

function selectSportStimulus(input: {
  planned: { sport: string; type: string; intensity?: string | null; durationMin: number };
  decision: PerformanceDecision; availMin: number; availableSports: string[]; raceBuild?: boolean;
}): Stimulus {
  const { planned, decision, availMin } = input;
  const sport = planned.sport, z = zoneNum(planned.intensity), hard = z >= 4 || ["interval", "threshold"].includes(planned.type);
  const p = decision.peripheral, centralOk = decision.central.status !== "suppressed" && decision.central.confidence !== "none";
  const legsBlocked = p.status === "high" || (p.hoursSinceHighEccentric != null && p.hoursSinceHighEccentric < ECCENTRIC_SPACING_H);
  const has = (s: string) => input.availableSports.includes(s);
  const push = decision.verdict === "push";
  const r = decision.readiness ?? 0;
  const longPushKind: StimulusKind = availMin > 90 ? "durability" : availMin < 45 ? "vo2" : "threshold";

  if (sport === "run") {
    if ((hard || push) && legsBlocked) {
      const why = p.hoursSinceHighEccentric != null && p.hoursSinceHighEccentric < ECCENTRIC_SPACING_H
        ? `last high-eccentric session ${p.hoursSinceHighEccentric} h ago (<${ECCENTRIC_SPACING_H} h)` : `peripheral load ${p.status}`;
      if (centralOk && has("bike")) return { sport: "bike", kind: push ? longPushKind : planned.type === "interval" ? "vo2" : "threshold", zone: push ? (availMin < 45 ? "z5" : "z4") : `z${Math.min(z, 4)}`, pivotedFrom: "run", reason: `Run → Bike: ${why}; central stable, keep metabolic stimulus concentric.` };
      if (centralOk && has("swim")) return { sport: "swim", kind: "threshold", zone: "z4", pivotedFrom: "run", reason: `Run → Swim: ${why}; zero-impact threshold.` };
      return { sport: "run", kind: "aerobic", zone: "z2", reason: `${why}; no concentric modality on record, run held at Z2.` };
    }
    if (push) return { sport, kind: longPushKind, zone: longPushKind === "vo2" ? "z5" : "z4", reason: "Central + peripheral clear, ≥48 h since eccentric load." };
    return { sport, kind: "planned", zone: `z${z}`, reason: "As planned." };
  }
  if (sport === "bike") {
    if (push && p.status === "high" && has("swim")) return { sport: "swim", kind: "threshold", zone: "z4", pivotedFrom: "bike", reason: "High lower-body soreness → swim threshold." };
    if (push) return { sport, kind: p.status === "high" ? "sweetspot" : longPushKind, zone: p.status === "high" ? "z3" : longPushKind === "vo2" ? "z5" : "z4", reason: p.status === "high" ? "High soreness: sweet-spot cap on bike." : "Bike carries peak metabolic load." };
    return { sport, kind: "planned", zone: `z${z}`, reason: "As planned." };
  }
  if (sport === "swim") {
    if (push) return { sport, kind: availMin < 45 ? "vo2" : "threshold", zone: availMin < 45 ? "z5" : "z4", reason: "Zero-impact: lower-body fatigue does not gate swim intensity." };
    return { sport, kind: "planned", zone: `z${z}`, reason: "As planned." };
  }
  if (sport === "strength" || sport === "hyrox") {
    const nmOk = r >= NEUROMUSCULAR_READINESS && p.status !== "high" && !(p.hoursSinceHighEccentric != null && p.hoursSinceHighEccentric < ECCENTRIC_SPACING_H);
    if (sport === "hyrox" || input.raceBuild) {
      if (push || hard) return { sport: "hyrox", kind: "compromised", zone: "z4", reason: legsBlocked ? "Compromised intervals with erg (ski/row) replacing run: legs loaded." : "Compromised run + station lactate-clearance intervals." };
      return { sport, kind: "planned", zone: `z${z}`, reason: "As planned." };
    }
    if (push && nmOk) return { sport: "strength", kind: "neuromuscular", zone: "z5", reason: `Readiness ${r} ≥ ${NEUROMUSCULAR_READINESS}: heavy 3–5 rep + SSC contrast.` };
    if (push) return { sport: "strength", kind: "planned", zone: `z${Math.min(z, 3)}`, reason: `Neuromuscular gate closed (readiness ${r}, peripheral ${p.status}).` };
    return { sport, kind: "planned", zone: `z${z}`, reason: "As planned." };
  }
  return { sport, kind: "planned", zone: `z${z}`, reason: "As planned." };
}

// ---------------- 6. T_avail DENSITY BUILDER ----------------
const step = (name: string, seconds: number, zone: string, phase: WorkoutStep["phase"], extra: Partial<WorkoutStep> = {}): WorkoutStep =>
  ({ name, seconds: Math.round(seconds), zone, phase, endpoint: { type: "time", seconds: Math.round(seconds) }, ...extra });

/** Exact step list that never exceeds availMin. Quality over quantity: the work dose is
 * capped by `stim.reps`; when the capped dose leaves >15 min unused the session ends
 * early instead of padding with more intervals. Returns null when the stimulus can't fit. */
export function buildDensitySteps(stim: Stimulus, availMin: number): WorkoutStep[] | null {
  if (stim.kind === "planned" || stim.kind === "recovery" || availMin < 20) return null;
  const total = Math.floor(availMin) * 60;
  const wu = (availMin < 30 ? 8 : availMin < 45 ? 10 : availMin <= 90 ? 15 : 20) * 60;
  const cd = (availMin < 45 ? 5 : 10) * 60;
  const main = total - wu - cd;
  if (main < 10 * 60) return null;
  const out: WorkoutStep[] = [step("Warm-up (progressive, include 3×20 s pick-ups)", wu, "z2", "warmup")];
  let used = 0;
  const add = (x: WorkoutStep) => { out.push(x); used += x.seconds; };
  const cap = (fit: number, fallback: number) => Math.max(1, Math.min(fit, stim.reps ?? fallback));
  const repeat = (label: string, n: number, on: [string, number, string], off: [string, number, string] | null, note?: string) => {
    for (let i = 0; i < n; i++) {
      add(step(on[0], on[1], on[2], "active", { group: label, ...(i === 0 && note ? { note } : {}) }));
      if (off && i < n - 1) add(step(off[0], off[1], off[2], "recovery", { group: label }));
    }
  };
  const fits = (work: number, rest: number) => Math.floor((main + rest) / (work + rest));
  const s = stim.sport, k = stim.kind, fam = stim.family ?? "middle";
  let fillToEnd = false;

  if (k === "vo2") {
    const setSec = 13 * 45 - 15, between = 180;
    const sets = cap(Math.min(3, fits(setSec, between)), availMin < 45 ? 3 : 2);
    if (fits(setSec, between) >= 1) {
      for (let i = 0; i < sets; i++) {
        repeat(`Set ${i + 1}/${sets}: 13 × 30/15 (fast VO2max)`, 13, [s === "swim" ? "30 s fast (CSS −5 s/100 m)" : "30 s hard (≈110–120% FTP / 3k effort)", 30, "z5"], ["15 s easy", 15, "z2"], i === 0 ? "Even effort every rep; breathing near max by rep 5." : undefined);
        if (i < sets - 1) add(step("Set recovery", between, "z1", "recovery"));
      }
    } else {
      repeat("30/15 micro-intervals", Math.floor((main + 15) / 45), ["30 s hard", 30, "z5"], ["15 s easy", 15, "z2"], "Even effort, no sprint start.");
    }
  } else if (k === "vo2-long") {
    const work = s === "swim" ? 180 : availMin < 45 ? 180 : 240, rest = s === "swim" ? 45 : work === 180 ? 120 : 180;
    const n = cap(Math.min(6, fits(work, rest)), 5);
    if (fits(work, rest) < 2) return null;
    repeat(`${n} × ${work / 60} min slow VO2max (90–95% MAS/MAP)`, n, [`${work / 60} min at VO2max pace/power`, work, "z5"], ["Easy recovery (keep moving)", rest, "z2"], "Reach target within 60 s, then hold.");
  } else if (k === "threshold" || k === "sweetspot") {
    const zone = k === "sweetspot" ? "z3" : "z4";
    if (availMin < 45 && k === "threshold" && s !== "swim") {
      const block = 6 * 60, n = cap(Math.max(1, Math.floor(main / (block + 120))), 3);
      for (let i = 0; i < n; i++) {
        for (let j = 0; j < 2; j++) { add(step("2 min under (95% FTP / LT)", 120, "z4", "active", { group: `Over-under ${i + 1}/${n}`, ...(i === 0 && j === 0 ? { note: "Unders comfortably hard; overs a controlled surge." } : {}) })); add(step("1 min over (105–110%)", 60, "z5", "active", { group: `Over-under ${i + 1}/${n}` })); }
        if (i < n - 1) add(step("Recovery", 120, "z2", "recovery"));
      }
    } else if (s === "swim") {
      const n = Math.max(4, Math.min(16, fits(115, 20), stim.reps ? stim.reps * 4 : 12));
      if (fits(115, 20) < 4) return null;
      repeat(`${n} × 100 m CSS`, n, ["100 m at CSS pace", 115, zone], ["Rest", 20, "z1"], "Hold the same split every 100.");
    } else {
      const work = k === "sweetspot" ? (fam === "long" || fam === "ultra" ? 15 : 12) * 60 : 10 * 60, rest = k === "sweetspot" ? 4 * 60 : 3 * 60;
      const n = cap(Math.min(5, fits(work, rest)), 3);
      if (fits(work, rest) < 1) return null;
      repeat(`${n} × ${work / 60} min ${k === "sweetspot" ? "sweet spot (88–94% FTP)" : "threshold (LT2)"}`, n, [`${work / 60} min at ${k === "sweetspot" ? "sweet spot" : "threshold"}`, work, zone], ["Easy", rest, "z2"], "Comfortably hard; last rep matches the first.");
    }
  } else if (k === "race-pace") {
    const spec = { short: [240, 120, "z5", 6], middle: [480, 120, "z4", 4], long: [900, 180, "z3", 3], ultra: [1800, 300, "z3", 2], hyrox: [240, 90, "z4", 6] }[fam] as [number, number, string, number];
    const [work, rest, zone, maxN] = spec;
    if (fits(work, rest) < 1) return null;
    const n = Math.min(maxN, cap(fits(work, rest), maxN));
    repeat(`${n} × ${Math.round(work / 60)} min at goal race pace`, n, [`${Math.round(work / 60)} min at race pace`, work, zone], ["Easy", rest, "z2"], "Race pace with relaxed form; rehearse fueling.");
  } else if (k === "durability") {
    const blocks = Math.max(1, Math.min(3, stim.reps ?? 2)), late = blocks * 600 + (blocks - 1) * 180;
    if (main < late + 20 * 60) return null;
    add(step("Steady Z2 aerobic volume (fuel 60–90 g/h as practised)", main - late, "z2", "active", { note: "Keep Z2 honest; this sets up the late blocks." }));
    for (let i = 0; i < blocks; i++) {
      add(step(`Late block ${i + 1}: 10 min threshold (fatigued)`, 600, "z4", "active", { group: "Late-session threshold" }));
      if (i < blocks - 1) add(step("Easy", 180, "z2", "recovery", { group: "Late-session threshold" }));
    }
  } else if (k === "taper-primer") {
    const zone = fam === "short" ? "z5" : fam === "long" || fam === "ultra" ? "z3" : "z4";
    const n = Math.max(3, Math.min(6, stim.reps ?? 5));
    const work = fam === "long" || fam === "ultra" ? 180 : 90, rest = 150;
    const primer = n * work + (n - 1) * rest;
    if (primer > main) return null;
    const easy = Math.max(0, Math.min(main - primer, 15 * 60));
    if (easy >= 60) add(step("Easy aerobic", easy, "z2", "active"));
    repeat(`${n} × ${work >= 120 ? `${work / 60} min` : `${work} s`} race-pace primer`, n, [`${work >= 120 ? `${work / 60} min` : `${work} s`} at race pace`, work, zone], ["Easy", rest, "z2"], "Sharp, not tiring. Finish fresher than you started.");
  } else if (k === "neuromuscular") {
    const sets = cap(4, 4);
    if (sets * 240 + sets * 110 > main + 270) return null;
    repeat(`Heavy compound: ${sets} × 3–5 reps @ RPE 8 (familiar lift only)`, sets, ["3–5 reps heavy, fast concentric", 60, "z5"], ["Full rest", 180, "z1"], "Bar speed matters: stop the set if it slows sharply.");
    repeat(`SSC contrast: ${sets} × 5 pogo / low-box rebounds (if previously coached)`, sets, ["5 reactive contacts, minimal ground time", 20, "z5"], ["Rest", 90, "z1"]);
  } else if (k === "compromised") {
    const erg = stim.reason.includes("erg");
    const unit = 240 + 120 + 90;
    const fit = Math.floor((main + 90) / unit);
    if (fit < 2) return null;
    const n = Math.max(2, Math.min(8, fit, stim.reps ?? 8));
    for (let i = 0; i < n; i++) {
      add(step(erg ? "1000 m SkiErg/Row at race pace" : "1 km run at HYROX race pace", 240, "z4", "active", { group: `Compromised round ${i + 1}/${n}`, ...(i === 0 ? { note: "Controlled first 200 m after each station." } : {}) }));
      add(step(["Wall balls ×20", "Sled push 25 m", "Burpee broad jumps ×10", "Sandbag lunges 20 m"][i % 4], 120, "z4", "active", { group: `Compromised round ${i + 1}/${n}` }));
      if (i < n - 1) add(step("Jog/walk flush (lactate clearance)", 90, "z2", "recovery", { group: `Compromised round ${i + 1}/${n}` }));
    }
  } else if (k === "aerobic") {
    add(step("Steady aerobic", main, "z2", "active", { note: "Conversational; nose-breathing pace." }));
    fillToEnd = true;
  } else {
    return null;
  }
  if (used > main) return null;
  const spare = main - used;
  // Quality over quantity: pad at most 10 min of easy aerobic; otherwise end early.
  // Taper primers never pad: shorter is the point (volume cut, intensity kept).
  const filler = fillToEnd ? spare : k === "taper-primer" ? 0 : spare > 15 * 60 ? 10 * 60 : spare;
  if (filler >= 60) out.push(step("Easy aerobic", filler, "z2", "active"));
  const cooldown = cd + (filler >= 60 || k === "taper-primer" ? 0 : filler);
  out.push(step("Cool-down", cooldown, "z1", "cooldown"));
  return out;
}

/** Estimated TSS from steps (labelled estimate: no power/HR file). */
export function estimateTss(steps: WorkoutStep[]): number {
  return Math.round(steps.reduce((s, x) => s + (x.seconds / 3600) * ZONE_IF[zoneNum(x.zone)] ** 2 * 100, 0));
}

/** Plan-level guard: keep ≥ 48 h between high-eccentric sessions by moving the later one to a concentric modality. */
export function enforceEccentricSpacing<T extends { date: Date | string; sport: string; type: string; intensity?: string | null }>(sessions: T[], availableSports: string[]): (T & { spacingNote?: string })[] {
  const sorted = [...sessions].sort((a, b) => t(a.date) - t(b.date));
  let last: number | null = null;
  return sorted.map(s => {
    const row: LoadRow = { date: s.date, sport: s.sport, type: s.type, intensity: s.intensity, minutes: 0 };
    if (!isHighEccentric(row)) return s;
    if (last != null && t(s.date) - last < ECCENTRIC_SPACING_H * 3600000) {
      const alt = availableSports.includes("bike") ? "bike" : availableSports.includes("swim") ? "swim" : null;
      if (alt) return { ...s, sport: alt, spacingNote: `Moved from ${s.sport}: <${ECCENTRIC_SPACING_H} h after previous high-eccentric session.` };
      return { ...s, intensity: "z2", type: "endurance", spacingNote: `Downgraded: <${ECCENTRIC_SPACING_H} h after previous high-eccentric session.` };
    }
    last = t(s.date);
    return s;
  });
}

function round1(n: number) { return Math.round(n * 10) / 10; }
function round3(n: number) { return Math.round(n * 1000) / 1000; }
