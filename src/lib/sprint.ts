// JasMiamiMethod — Sprint-specific training engine
// World-class sprint protocols for athletes targeting national/international
// level 100m/200m/400m. Zones are velocity-based (% max velocity), not
// endurance-based (% threshold). Built on:
// - Haugen et al. 2019 sprint development review
// - Ramírez-Campillo 2022 plyometric meta
// - Loturco 2016 neuromuscular monitoring
// - Rumpf et al. 2016 sprint-specific training methods

export type SprintEvent = "100m" | "200m" | "400m";
export type SprintPhase = "general_prep" | "specific_prep" | "pre_comp" | "comp" | "transition";

export interface SprintZone {
  name: string;
  velocityPct: number; // % of max velocity
  distance: string;
  rest: string;
    purpose: string;
}

// Sprint training intensity zones (velocity-based)
export const SPRINT_ZONES: SprintZone[] = [
  { name: "Acceleration", velocityPct: 0.60, distance: "10-30m", rest: "2-3 min", purpose: "Develop force production and mechanics from blocks" },
  { name: "Max Velocity", velocityPct: 1.00, distance: "20-60m", rest: "4-6 min", purpose: "Reach and sustain top speed — the primary 100m determinant" },
  { name: "Speed Endurance I", velocityPct: 0.95, distance: "60-150m", rest: "8-12 min", purpose: "Maintain near-max velocity under fatigue (100-200m specific)" },
  { name: "Speed Endurance II", velocityPct: 0.90, distance: "150-300m", rest: "12-20 min", purpose: "Lactate tolerance for 200-400m" },
  { name: "Special Endurance I", velocityPct: 0.85, distance: "300-600m", rest: "15-25 min", purpose: "Glycolytic capacity — 400m race simulation" },
  { name: "Special Endurance II", velocityPct: 0.80, distance: "600-800m", rest: "20-30 min", purpose: "Aerobic power for 400m — the long-sprint zone" },
  { name: "Tempo (Extensive)", velocityPct: 0.70, distance: "100-400m reps", rest: "45-90s", purpose: "Aerobic recovery, capillary development, active regen" },
  { name: "Tempo (Intensive)", velocityPct: 0.80, distance: "80-200m reps", rest: "2-4 min", purpose: "Lactate threshold — bridges tempo and speed endurance" },
];

// What elite sprinters actually do (Haugen 2019 review of world-class programs)
export const ELITE_MODEL = {
  weeklyStructure: {
    speedDays: 2-3,        // max velocity or acceleration work
    strengthDays: 2-3,     // heavy + explosive
    tempoDays: 1-2,        // extensive tempo for recovery
    totalSessions: "5-8",
    plyoPerWeek: "1-2 (mandatory)",
  },
  volumeGuidelines: {
    maxVelocityReps: "80-300m total per session (quality stops when speed drops >2%)",
    accelerationReps: "6-10 × 10-30m",
    strengthSets: "3-5 × 3-5 reps at 85-95% 1RM",
    plyoContacts: "40-80 ground contacts per session",
  },
  taperProtocol: {
    volumeReduction: "40-50% in final 7-10 days",
    intensityMaintenance: "Keep short accelerations + 1-2 flying sprints at race pace",
    frequency: "Maintain session frequency (reduce volume, not sessions)",
    potentiation: "Day before race: 3×20m build + 1×60m @ 95% — nervous system priming",
  },
  biomarkers: {
    cmjDrop: ">8% below baseline = convert speed session to tempo",
    hrTrend: "Morning HR +5bpm above baseline for 3+ days = reduce load",
    creatineKinase: "Elevated 48h post heavy eccentric = delay next max-velocity session",
  },
};

// Sprint-specific ergogenic protocol
export const SPRINT_ERGOGENICS = [
  { key: "creatine", priority: 1, note: "3-5g/d — increases phosphocreatine pool, improves repeat sprint and acceleration" },
  { key: "betaAlanine", priority: 2, note: "3.2-6.4g/d — buffers H+ for 200-400m (60-240s efforts)" },
  { key: "caffeine", priority: 3, note: "3-6mg/kg 60min pre — improves RFD and reaction time" },
  { key: "bicarb", priority: 4, note: "0.3g/kg 90min pre-race — for 400m only, test in training first" },
  { key: "nitrate", priority: 5, note: "400-500mg 2-3h pre — may improve repeat-sprint recovery" },
];

// Generate a sprint training plan
export function generateSprintPlan(opts: {
  event: SprintEvent;
  level: string;
  weeks: number;
  startDate: Date;
  weeklyHours?: number;
}): { weeks: { week: number; phase: SprintPhase; sessions: { title: string; type: string; minutes: number; description: string }[] }[] } {
  const { event, weeks, startDate } = opts;
  const sessions = event === "100m"
    ? ["Acceleration + Blocks", "Max Velocity + Flying Sprints", "Strength: Heavy Lower", "Tempo + Core", "Strength: Power + Plyo"]
    : event === "200m"
    ? ["Acceleration + Speed Endurance I", "Max Velocity + Speed Endurance II", "Strength: Heavy Lower", "Tempo + Core", "Strength: Power + Plyo"]
    : ["Speed Endurance I + II", "Special Endurance I", "Strength: Heavy Lower", "Tempo + Core", "Strength: Power + Plyo"];

  const weeksOut: any[] = [];
  for (let w = 1; w <= weeks; w++) {
    const phase: SprintPhase = w <= Math.floor(weeks * 0.3) ? "general_prep"
      : w <= Math.floor(weeks * 0.6) ? "specific_prep"
      : w <= weeks - 1 ? "pre_comp"
      : "comp";
    weeksOut.push({
      week: w,
      phase,
      sessions: sessions.map((title, i) => ({
        title,
        type: i < 2 ? "speed" : i === 2 ? "strength" : i === 3 ? "tempo" : "strength",
        minutes: i < 2 ? 90 : i === 3 ? 45 : 75,
        description: `${title} — ${phase.replace("_", " ")} phase for ${event}. See SPRINT_ZONES for intensity targets.`,
      })),
    });
  }
  return { weeks: weeksOut };
}
