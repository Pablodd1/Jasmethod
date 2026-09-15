// JasMiamiMethod — AthleteState V2 (shadow mode)
//
// Multi-dimensional athlete state. Replaces the single 0-100 readiness
// number with separate dimensions that each expose their data, confidence,
// and reason codes. Missing data means lower confidence — never poor
// readiness.
//
// SHADOW MODE: V2 runs alongside V1 and stores its output for comparison.
// It makes NO user-visible changes until COACH_ENGINE_VERSION = "v2".
//
// PRINCIPLES:
// - HRV is one contextual signal, not the training decision
// - Multiple caution signals may reduce intensity; no single positive
//   signal escalates it
// - Illness/injury are priority overrides
// - Menstrual status is contextual, not an automatic penalty
// - Every dimension reports confidence (data coverage)

import type { HrvStatus } from "./hrv-status";

// ---- Types ----
export interface Dimension {
  status: "good" | "neutral" | "caution" | "unknown";
  value?: number | string;
  confidence: number; // 0-1
  reason: string;
  evidenceClaimIds: string[];
}

export interface AthleteStateV2 {
  aerobicReadiness: Dimension;
  neuromuscularReadiness: Dimension;
  subjectiveWellness: Dimension;
  sleepStatus: Dimension;
  trainingLoadStatus: Dimension;
  musculoskeletalStatus: Dimension;
  healthCaution: Dimension;
  environmentalStress: Dimension;
  dataConfidence: number; // 0-1
  dataCoverage: number;   // 0-1
  reasonCodes: string[];
  engineVersion: "shadow-v2";
  timestamp: string;
}

export interface AthleteStateInput {
  // HRV
  hrvToday?: number;
  hrvBaseline7d?: number[];
  hrvStatus?: HrvStatus | string;
  hrvDevices?: string[]; // e.g. ["whoop","garmin"]

  // Subjective (from check-in)
  sleep?: number;         // 1-5
  soreness?: number;      // 1-5 (5 = very sore)
  energy?: number;        // 1-5
  stress?: number;        // 1-5 (5 = very stressed)
  motivation?: number;    // 1-5
  mood?: number;          // 1-5

  // Training load
  recentTss?: number[];   // last 7 days of TSS values
  plannedTssToday?: number;
  daysSinceLastHard?: number;

  // Performance
  rhrToday?: number;
  rhrBaseline?: number;

  // Musculoskeletal
  painFlag?: boolean;
  injuredFlag?: boolean;

  // Health
  sick?: boolean;
  menstrualSymptoms?: boolean;
  menstrualDay?: number;

  // Environment
  tempC?: number;
  humidityPct?: number;
  altitudeM?: number;

  // Athlete
  experience?: string;    // beginner | amateur | advanced | pro
}

// ---- Helper: normalise check-in scale (1-5 → -1 to +1) ----
function norm5(v?: number): number | null {
  if (v == null || v < 1 || v > 5) return null;
  return (v - 3) / 2; // 1 → -1, 3 → 0, 5 → +1
}

// ---- Compute each dimension ----

function computeAerobicReadiness(input: AthleteStateInput): Dimension {
  const claims = ["plews-hrv-baseline-2013", "hrv-guided-training-2021"];
  if (input.hrvToday == null || input.hrvBaseline7d == null || input.hrvBaseline7d.length < 3) {
    return { status: "unknown", confidence: 0.2, reason: "No HRV data — needs at least 3 days of baseline", evidenceClaimIds: claims };
  }
  const avg = input.hrvBaseline7d.reduce((a, b) => a + b, 0) / input.hrvBaseline7d.length;
  const sd = Math.sqrt(input.hrvBaseline7d.reduce((a, b) => a + (b - avg) ** 2, 0) / input.hrvBaseline7d.length);
  if (sd <= 0) return { status: "unknown", confidence: 0.3, reason: "HRV baseline has no variance", evidenceClaimIds: claims };

  const z = (input.hrvToday - avg) / sd;
  // HRV alone never escalates intensity; it can only add caution or confirm good recovery
  if (z >= 1) return { status: "good", value: z, confidence: 0.8, reason: `HRV elevated (+${z.toFixed(1)} SD vs 7d baseline)`, evidenceClaimIds: claims };
  if (z >= -0.5) return { status: "neutral", value: z, confidence: 0.8, reason: `HRV in normal range (${z.toFixed(1)} SD)`, evidenceClaimIds: claims };
  if (z >= -1) return { status: "caution", value: z, confidence: 0.8, reason: `HRV trending down (${z.toFixed(1)} SD)`, evidenceClaimIds: claims };
  return { status: "caution", value: z, confidence: 0.8, reason: `HRV suppressed (${z.toFixed(1)} SD below baseline)`, evidenceClaimIds: claims };
}

function computeNeuromuscularReadiness(input: AthleteStateInput): Dimension {
  const claims = ["robinson-failure-2024"];
  if (input.soreness == null) {
    return { status: "unknown", confidence: 0.2, reason: "No soreness data", evidenceClaimIds: claims };
  }
  const s = norm5(input.soreness);
  if (s == null) return { status: "unknown", confidence: 0.2, reason: "Invalid soreness value", evidenceClaimIds: claims };
  if (s >= 0.5) return { status: "caution", value: s, confidence: 0.7, reason: `High soreness (${input.soreness}/5)`, evidenceClaimIds: claims };
  if (s <= -0.5) return { status: "good", value: s, confidence: 0.7, reason: `Low soreness (${input.soreness}/5)`, evidenceClaimIds: claims };
  return { status: "neutral", value: s, confidence: 0.7, reason: `Moderate soreness (${input.soreness}/5)`, evidenceClaimIds: claims };
}

function computeSubjectiveWellness(input: AthleteStateInput): Dimension {
  const parts: number[] = [];
  const claims = ["gollwitzer-1999"];
  for (const v of [input.energy, input.mood, input.motivation]) {
    const n = norm5(v);
    if (n != null) parts.push(n);
  }
  const stress = norm5(input.stress);
  if (stress != null) parts.push(-stress); // stress is inverse

  if (parts.length < 2) {
    return { status: "unknown", confidence: 0.2, reason: "Insufficient subjective data", evidenceClaimIds: claims };
  }
  const avg = parts.reduce((a, b) => a + b, 0) / parts.length;
  const confidence = Math.min(0.8, 0.3 + parts.length * 0.15);
  if (avg >= 0.5) return { status: "good", value: avg, confidence, reason: `Strong subjective wellness (${parts.length} signals, avg +${avg.toFixed(2)})`, evidenceClaimIds: claims };
  if (avg <= -0.5) return { status: "caution", value: avg, confidence, reason: `Low subjective wellness (${parts.length} signals, avg ${avg.toFixed(2)})`, evidenceClaimIds: claims };
  return { status: "neutral", value: avg, confidence, reason: `Moderate subjective wellness (${parts.length} signals)`, evidenceClaimIds: claims };
}

function computeSleepStatus(input: AthleteStateInput): Dimension {
  const claims = ["mah-sleep-2011"];
  if (input.sleep == null) {
    return { status: "unknown", confidence: 0.1, reason: "No sleep data", evidenceClaimIds: claims };
  }
  const s = norm5(input.sleep);
  if (s == null) return { status: "unknown", confidence: 0.1, reason: "Invalid sleep value", evidenceClaimIds: claims };
  if (s >= 0.5) return { status: "good", value: s, confidence: 0.7, reason: `Good sleep (${input.sleep}/5)`, evidenceClaimIds: claims };
  if (s <= -0.5) return { status: "caution", value: s, confidence: 0.7, reason: `Poor sleep (${input.sleep}/5)`, evidenceClaimIds: claims };
  return { status: "neutral", value: s, confidence: 0.7, reason: `Moderate sleep (${input.sleep}/5)`, evidenceClaimIds: claims };
}

function computeTrainingLoadStatus(input: AthleteStateInput): Dimension {
  const claims = ["currier-strength-2023", "intensity-distribution-2025"];
  if (!input.recentTss?.length) {
    return { status: "unknown", confidence: 0.1, reason: "No training load data", evidenceClaimIds: claims };
  }
  const tss = input.recentTss;
  const avg = tss.reduce((a, b) => a + b, 0) / tss.length;
  const ramp = tss.length >= 7
    ? (tss.slice(-3).reduce((a, b) => a + b, 0) / 3) / Math.max(1, tss.slice(0, -3).reduce((a, b) => a + b, 0) / Math.max(1, tss.length - 3)) - 1
    : 0;
  if (avg > 120 || ramp > 0.3) return { status: "caution", value: avg, confidence: 0.7, reason: `High load (avg TSS ${Math.round(avg)}, ramp ${(ramp * 100).toFixed(0)}%)`, evidenceClaimIds: claims };
  if (avg < 20) return { status: "neutral", value: avg, confidence: 0.5, reason: `Low load (avg TSS ${Math.round(avg)})`, evidenceClaimIds: claims };
  return { status: "neutral", value: avg, confidence: 0.7, reason: `Moderate load (avg TSS ${Math.round(avg)})`, evidenceClaimIds: claims };
}

function computeMusculoskeletalStatus(input: AthleteStateInput): Dimension {
  const claims: string[] = [];
  if (input.injuredFlag) return { status: "caution", confidence: 0.9, reason: "Athlete flagged as injured", evidenceClaimIds: claims };
  if (input.painFlag) return { status: "caution", confidence: 0.8, reason: "Pain reported in check-in", evidenceClaimIds: claims };
  return { status: "neutral", confidence: 0.5, reason: "No MSK concerns reported", evidenceClaimIds: claims };
}

function computeHealthCaution(input: AthleteStateInput): Dimension {
  const claims: string[] = [];
  if (input.sick) return { status: "caution", confidence: 0.9, reason: "Athlete reported illness — training pause recommended", evidenceClaimIds: claims };
  // Menstrual status is contextual — not an automatic readiness penalty
  if (input.menstrualSymptoms) return { status: "caution", confidence: 0.6, reason: "Menstrual symptoms reported — adjust intensity based on feel", evidenceClaimIds: claims };
  return { status: "neutral", confidence: 0.5, reason: "No health concerns reported", evidenceClaimIds: claims };
}

function computeEnvironmentalStress(input: AthleteStateInput): Dimension {
  const claims: string[] = [];
  if (input.altitudeM != null && input.altitudeM > 1500) {
    return { status: "caution", confidence: 0.7, reason: `Altitude ${input.altitudeM}m — reduce intensity expectations`, evidenceClaimIds: claims };
  }
  if (input.tempC != null && input.tempC > 28) {
    return { status: "caution", confidence: 0.7, reason: `High temperature ${input.tempC}°C — reduce intensity, hydrate`, evidenceClaimIds: claims };
  }
  return { status: "neutral", confidence: 0.5, reason: "Normal environmental conditions", evidenceClaimIds: claims };
}

// ---- Main function ----
export function computeAthleteState(input: AthleteStateInput): AthleteStateV2 {
  const aerobic = computeAerobicReadiness(input);
  const neuromuscular = computeNeuromuscularReadiness(input);
  const subjective = computeSubjectiveWellness(input);
  const sleep = computeSleepStatus(input);
  const load = computeTrainingLoadStatus(input);
  const msk = computeMusculoskeletalStatus(input);
  const health = computeHealthCaution(input);
  const environment = computeEnvironmentalStress(input);

  const dims = [aerobic, neuromuscular, subjective, sleep, load, msk, health, environment];
  const dataPoints = dims.filter((d) => d.status !== "unknown").length;
  const dataCoverage = dataPoints / dims.length;
  const dataConfidence = dims.reduce((a, d) => a + d.confidence, 0) / dims.length;

  const reasonCodes: string[] = [];
  for (const d of dims) {
    if (d.status === "caution") reasonCodes.push(d.reason);
    if (d.status === "good") reasonCodes.push(d.reason);
  }

  return {
    aerobicReadiness: aerobic,
    neuromuscularReadiness: neuromuscular,
    subjectiveWellness: subjective,
    sleepStatus: sleep,
    trainingLoadStatus: load,
    musculoskeletalStatus: msk,
    healthCaution: health,
    environmentalStress: environment,
    dataConfidence,
    dataCoverage,
    reasonCodes,
    engineVersion: "shadow-v2",
    timestamp: new Date().toISOString(),
  };
}

// ---- Shadow comparison ----
export interface ShadowComparison {
  v1Verdict: string;
  v2Dimensions: AthleteStateV2;
  agreement: "agree" | "v1_more_conservative" | "v2_more_conservative" | "different_axes";
  explanation: string;
  timestamp: string;
}

export function compareShadow(v1Readiness: number, v1Verdict: string, input: AthleteStateInput): ShadowComparison {
  const v2 = computeAthleteState(input);
  let agreement: ShadowComparison["agreement"] = "agree";
  const explanations: string[] = [];

  const v1Conservative = v1Readiness < 40 || v1Verdict === "rest" || v1Verdict === "easy";
  const v2Conservative = v2.aerobicReadiness.status === "caution" || v2.subjectiveWellness.status === "caution";

  if (v1Conservative === v2Conservative) agreement = "agree";
  else if (v1Conservative) agreement = "v1_more_conservative";
  else agreement = "v2_more_conservative";

  if (agreement !== "agree") {
    explanations.push(`V1 ${v1Conservative ? "conservative" : "permissive"}; V2 ${v2Conservative ? "conservative" : "permissive"}`);
    explanations.push("V2 evaluates dimensions independently — the disagreement may reveal a signal V1 overweights or ignores");
  }

  return {
    v1Verdict,
    v2Dimensions: v2,
    agreement,
    explanation: explanations.join(". "),
    timestamp: new Date().toISOString(),
  };
}
