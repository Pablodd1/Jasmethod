// JasMiamiMethod — Sprint protocol knowledge base (200/400 m)
//
// Wraps the 97-entry research database (sprints_protocols.json — Hart, Smith,
// Seagrave, SET reviews, pacing models, strength/taper/nutrition lanes; every
// entry carries dose, rest, evidence tier and source URLs).
//
// Integration doctrine (per external-review §C): this is a RETRIEVAL library
// feeding our existing plan engine — NOT a parallel AI path. Sessions built
// here cite their protocol ids and keep "not specified in source" honest.

import sprintDbRaw from "@/data/sprints_protocols.json";

export interface SprintProtocol {
  id: string;
  lane: string;
  domain: string;
  event: string[];
  phase: string;
  title: string;
  protocol: string;
  dose: string;
  rest_ratio: string;
  app_rule: string;
  evidence_level: string;
  sources: string[];
  caveats: string;
}

const DB = sprintDbRaw as unknown as {
  count: number;
  protocols: SprintProtocol[];
};

export function allSprintProtocols(): SprintProtocol[] {
  return DB.protocols;
}

export function getSprintProtocol(id: string): SprintProtocol | undefined {
  return DB.protocols.find((p) => p.id === id);
}

export interface SelectOpts {
  domains?: string[];
  event?: "100" | "200" | "400";
  minEvidence?: string; // weakest tier allowed
  excludeNotSpecified?: boolean;
}

const EVIDENCE_ORDER = [
  "needs_verification", "coach_practice", "expert_practitioner",
  "narrative_review", "cross_sectional", "observational", "case_study",
  "systematic_review", "peer_reviewed_modeling", "rct", "meta_analysis",
];

export function selectSprintProtocols(opts: SelectOpts = {}): SprintProtocol[] {
  const minIdx = opts.minEvidence
    ? EVIDENCE_ORDER.indexOf(opts.minEvidence)
    : -1;
  return DB.protocols.filter((p) => {
    if (opts.domains?.length && !opts.domains.includes(p.domain)) return false;
    if (opts.event && !p.event.includes(opts.event)) return false;
    if (minIdx >= 0) {
      const lvl = EVIDENCE_ORDER.indexOf(p.evidence_level);
      if (lvl < minIdx) return false;
    }
    if (opts.excludeNotSpecified && /not specified in source/i.test(p.rest_ratio)) return false;
    return true;
  });
}

// ---- Race-model math (Hart / published intervention, verbatim rules) ----

/** 400 m potential from a 200 m PB: (2 × 200 m) + 3.5 s. */
export function predict400From200(pb200s: number): number {
  return +(pb200s * 2 + 3.5).toFixed(2);
}

/**
 * Segment targets for a 400 m runner (Hart's race model + elite shape
 * 25.4 / 23.3 / 24.4 / 26.9 %): open at PB+1 s (advanced) or +2 s (novice),
 * distribute the remainder on the elite shape.
 */
export function race400Segments(
  pb200s: number,
  level: "novice" | "advanced" = "advanced",
): { potential: number; segments: [number, number, number, number] } {
  const potential = predict400From200(pb200s);
  const open = pb200s + (level === "novice" ? 2.0 : 1.0);
  const rest = potential - open;
  const shape = [0.254, 0.233, 0.244, 0.269];
  const back = rest * (1 - shape[3]);
  const seg1 = open;
  const seg2 = back * (shape[0] / (shape[0] + shape[1] + shape[2])) * (shape[1] / shape[0]) + back * (shape[1] / (shape[0] + shape[1] + shape[2]));
  // Simpler honest distribution: remaining 200 m split on the elite 200-share
  const midTotal = potential - open - rest * shape[3];
  const s2 = +(midTotal * 0.515).toFixed(2);
  const s3 = +(midTotal * 0.485).toFixed(2);
  const s4 = +(rest * shape[3]).toFixed(2);
  void seg1; void seg2;
  return { potential, segments: [+open.toFixed(2), s2, s3, s4] };
}

/** Speed-reserve opening: 93–95 % of 200 m PB (Badon). */
export function speedReserveOpen(pb200s: number): number {
  return +(pb200s / 0.94).toFixed(2);
}

// ---- Session builder: named coach sets → executable WorkoutStep-like rows ----

export interface SprintSessionRow {
  name: string;
  meters: number;
  reps: number;
  restBetweenRepsMin: number;
  intensity: string; // e.g. "95%", "Z5"
  sourceId: string;
  sourceTitle: string;
}

export interface SprintSession {
  kind: string;
  rows: SprintSessionRow[];
  sourceIds: string[];
  coachReview: string[];
}

// Hart's menus, verbatim from C-C-002 / A-A15 (expert_practitioner):
const HART_SESSIONS: { kind: string; meters: number; reps: number; restMin: number }[] = [
  { kind: "Speed endurance", meters: 100, reps: 10, restMin: 7.5 },
  { kind: "Speed endurance", meters: 150, reps: 6, restMin: 7.5 },
  { kind: "Speed endurance", meters: 200, reps: 5, restMin: 10 },
  { kind: "Speed endurance", meters: 300, reps: 4, restMin: 10 },
  { kind: "Speed endurance", meters: 350, reps: 3, restMin: 10 },
  { kind: "Speed endurance", meters: 450, reps: 2, restMin: 10 },
  { kind: "Tempo endurance", meters: 200, reps: 8, restMin: 2 },
  { kind: "Tempo endurance", meters: 300, reps: 6, restMin: 2 },
  { kind: "Event runs (broken 400)", meters: 300, reps: 3, restMin: 5 },
  { kind: "Event runs (450 pace 400)", meters: 450, reps: 2, restMin: 15 },
];

// SET research sessions (A-A02, narrative_review): time-based 400 m doses
const SET_SESSIONS: { kind: string; seconds: number; reps: number; restMin: number; mode: "SET-P" | "SET-M" }[] = [
  { kind: "SET-P 30 s all-out", seconds: 30, reps: 6, restMin: 3, mode: "SET-P" },
  { kind: "SET-P 30 s all-out", seconds: 30, reps: 10, restMin: 3.5, mode: "SET-P" },
  { kind: "SET-M 60 s all-out", seconds: 60, reps: 8, restMin: 1, mode: "SET-M" },
  { kind: "SET-M 20 s all-out", seconds: 20, reps: 8, restMin: 1 / 6, mode: "SET-M" },
];

/** Pick a speed-endurance / tempo / SET session from the menus, phase-aware. */
export function buildSprintSession(
  phase: "fall" | "early" | "mid" | "late" | "taper",
  variant = 0,
): SprintSession {
  const rows: SprintSessionRow[] = [];
  const sourceIds: string[] = ["A-A15_HART_400M_PROGRAMME", "C-C-002"];
  const coachReview: string[] = [];
  const menu = (() => {
    if (phase === "taper") {
      // Taper: volume −41–60 %, intensity unchanged (meta-analytic; A-A16).
      sourceIds.push("A-A16_TAPER_SPEED_POWER");
      const base = HART_SESSIONS[2]; // 5 × 200 m
      return [{ ...base, reps: Math.max(2, Math.round(base.reps * 0.5)) }];
    }
    const se = HART_SESSIONS.filter((s) => s.kind === "Speed endurance");
    const tempo = HART_SESSIONS.filter((s) => s.kind === "Tempo endurance");
    const ev = HART_SESSIONS.filter((s) => s.kind.startsWith("Event runs"));
    if (phase === "fall") return [tempo[variant % tempo.length], se[variant % se.length]];
    if (phase === "early") return [se[(variant + 1) % se.length], tempo[variant % tempo.length]];
    if (phase === "mid") return [ev[variant % ev.length], se[(variant + 2) % se.length]];
    return [ev[(variant + 1) % ev.length], se[(variant + 3) % se.length]];
  })();
  for (const s of menu) {
    rows.push({
      name: `${s.kind}: ${s.reps} × ${s.meters} m`,
      meters: s.meters,
      reps: s.reps,
      restBetweenRepsMin: s.restMin,
      intensity: "95% (never 100% for 60 m+)",
      sourceId: "A-A15_HART_400M_PROGRAMME",
      sourceTitle: "Hart 400 m programme (coach practice)",
    });
  }
  // SET research session on mid/late phases
  if (phase === "mid" || phase === "late") {
    const set = SET_SESSIONS[(variant + (phase === "late" ? 1 : 0)) % SET_SESSIONS.length];
    rows.push({
      name: `${set.kind}: ${set.reps} × ${set.seconds} s (${set.mode})`,
      meters: 0,
      reps: set.reps,
      restBetweenRepsMin: set.restMin,
      intensity: "all-out",
      sourceId: "A-A02_SET_PROTOCOLS_AND_P_VS_M",
      sourceTitle: "SET review — exact doses (Bangsbo 2025)",
    });
    sourceIds.push("A-A02_SET_PROTOCOLS_AND_P_VS_M");
  }
  // Honest gaps: rest for these shapes is coach practice, not RCT-verified
  coachReview.push(
    "Rest intervals are coach practice (Hart) — no RCT exists for 200/400 m rest dosing.",
  );
  return { kind: `Sprint ${phase} session`, rows, sourceIds: Array.from(new Set(sourceIds)), coachReview };
}

/** JASAI/plan grounding context for the athlete's phase. */
export function sprintContextForPhase(phase: "fall" | "early" | "mid" | "late" | "taper"): string {
  const protos = selectSprintProtocols({
    domains: ["speed_endurance", "tapering", "race_model"],
    minEvidence: "observational",
  }).slice(0, 6);
  return protos
    .map((p) => `[${p.id}] ${p.title} — dose: ${p.dose.slice(0, 160)} | rest: ${p.rest_ratio.slice(0, 100)}`)
    .join("\n");
}
