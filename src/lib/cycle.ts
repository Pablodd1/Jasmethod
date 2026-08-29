// JasMiamiMethod — Female athlete cycle awareness (evidence-based, honest).
// The menstrual cycle literature shows small, individual effects — this module
// adjusts training/fuel with citations, and ALWAYS defers to the athlete's
// own check-in scores (individual variability dominates, per McNulty 2020).
// ponytail: cycle day is self-reported; upgrade path = integrate cycle-tracking
// (Oura/Natural Cycles) when OAuth lands.

export type CyclePhase = "early-follicular" | "late-follicular" | "ovulatory" | "early-luteal" | "late-luteal" | "unknown";

export function cyclePhase(dayOfCycle?: number | null): CyclePhase {
  if (!dayOfCycle || dayOfCycle < 1 || dayOfCycle > 35) return "unknown";
  if (dayOfCycle <= 5) return "early-follicular";
  if (dayOfCycle <= 12) return "late-follicular";
  if (dayOfCycle <= 15) return "ovulatory";
  if (dayOfCycle <= 19) return "early-luteal";
  return "late-luteal"; // 20-28+ (late luteal → menstruation)
}

export interface CycleAdvice {
  phase: CyclePhase;
  label: string;
  strength: "peak" | "good" | "reduced" | "variable";
  endurance: "peak" | "good" | "reduced" | "variable";
  proteinPerKg: number;       // g/kg/day (luteal needs more)
  trainingNote: string;
  sourceIds: string[];
}

// Evidence (see research.ts additions):
// - Niering 2024 meta: isometric/dynamic strength favor LATE FOLLICULAR; early
//   follicular unfavorable for max strength (small-to-medium effects).
// - McNulty 2020 / Blagrove 2020: overall effects trivial-to-small; individual
//   variability dominates → never override the athlete's own scores.
// - Williamson 2023: female endurance athletes ~1.89 g/kg; luteal +0.1-0.2.
const ADVICE: Record<CyclePhase, Omit<CycleAdvice, "phase" | "label">> = {
  "early-follicular": {
    strength: "reduced", endurance: "reduced",
    proteinPerKg: 1.8,
    trainingNote: "Perceived effort tends to run high and max strength tends to dip (Niering 2024). Keep planned sessions but trust your check-in — if energy scored low, this is the phase to take the easy option without guilt.",
    sourceIds: ["niering2024", "mcnull2020"],
  },
  "late-follicular": {
    strength: "peak", endurance: "good",
    proteinPerKg: 1.8,
    trainingNote: "Best window of the cycle for strength and power (Niering 2024; estrogen rising). This is the phase to schedule your heaviest strength day and hardest intervals — you'll feel the difference.",
    sourceIds: ["niering2024"],
  },
  ovulatory: {
    strength: "good", endurance: "variable",
    proteinPerKg: 1.8,
    trainingNote: "Power/anaerobic output can peak around ovulation, but some athletes report a performance dip. Listen to the session: if it feels great, push; if not, that's normal too.",
    sourceIds: ["mcnull2020"],
  },
  "early-luteal": {
    strength: "good", endurance: "good",
    proteinPerKg: 1.9,
    trainingNote: "Early luteal is often still strong. Protein needs rise slightly in the luteal phase (Williamson 2023) — bump intake to ~1.9 g/kg today.",
    sourceIds: ["williamson2023"],
  },
  "late-luteal": {
    strength: "variable", endurance: "reduced",
    proteinPerKg: 1.9,
    trainingNote: "The most variable phase: perceived performance and motivation are at their lowest (Carmichael 2021; PMS symptoms peak). Keep training light-to-moderate, prioritize sleep and protein (~1.9 g/kg), and don't judge the week by these numbers.",
    sourceIds: ["carmichael2021", "williamson2023"],
  },
  unknown: {
    strength: "variable", endurance: "variable",
    proteinPerKg: 1.8,
    trainingNote: "Cycle day not tracked. If you log it in the check-in ('cycle day'), we'll phase-adjust training and protein — research shows small but real differences (Niering 2024).",
    sourceIds: ["niering2024"],
  },
};

export function cycleAdvice(dayOfCycle?: number | null, sex?: string | null): CycleAdvice | null {
  if (sex !== "female") return null; // male athletes: no cycle adjustment
  const phase = cyclePhase(dayOfCycle);
  const base = ADVICE[phase];
  return { phase, label: phase.replace(/-/g, " "), ...base };
}

// Protein per kg for any athlete (sex + age aware):
// - Male endurance: 1.6-1.8 g/kg (ISSN 2017)
// - Female endurance: 1.71-1.89 g/kg (Williamson 2023 — higher than males)
// - Luteal phase: +0.1 (handled above)
// - Strength/power: 1.6-2.0 (ISSN)
export function proteinPerKg(sex?: string | null, strengthFocus?: boolean, age?: number | null): number {
  if (strengthFocus) return 1.9; // upper ISSN range
  if (sex === "female") return age && age >= 40 ? 1.9 : 1.8; // masters: higher to offset anabolic resistance
  return 1.7;
}

// ---- Youth training policy (research-grounded minimum age) ----
// AOSSM: no hard minimum, but emotional maturity to follow instructions (~7-8);
// children should NOT train alone. NSCA: no specific age, readiness-based.
// App policy: hard-gate accounts under 13 (platform/COPPA), guidance 13-17.
export interface YouthPolicy {
  allowed: boolean;
  minAge: number;
  note: string;
}

export function youthPolicy(birthYear?: number | null): YouthPolicy {
  const age = birthYear ? new Date().getFullYear() - birthYear : null;
  if (age === null) return { allowed: true, minAge: 0, note: "Birth year not set — no age-based adjustment." };
  if (age < 13) return { allowed: false, minAge: 13, note: `Age ${age}: accounts require age 13+ (platform policy). Youth strength training is safe ~7-8+ with supervision (AOSSM), but this app is not designed for unsupervised minors.` };
  if (age < 18) return { allowed: true, minAge: 13, note: `Age ${age}: youth athlete — training volume is set conservatively. Always train under supervision; no max-effort lifting to failure (NSCA youth guidelines).` };
  return { allowed: true, minAge: 13, note: `Age ${age}: adult athlete — full training load.` };
}
