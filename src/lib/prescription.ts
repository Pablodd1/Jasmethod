export interface WorkoutStep {
  name: string;
  seconds: number;
  zone: string;
  phase: "warmup" | "active" | "recovery" | "cooldown";
  reps?: number;
  note?: string;
  group?: string; // repeat-set header this step belongs to ("Repeat 7 × 1 min")
  endpoint?: { type: "time"; seconds: number } | { type: "distance"; meters: number } | { type: "reps"; reps: number } | { type: "lap" };
  target?: { type: "open" | "power" | "heartRate" | "pace" | "speed"; low?: number; high?: number };
  targets?: { rpe: number; hr?: string; power?: string; pace?: string };
}

// ---- Sport-specific step builders (sets, reps, variations) ----
// Every training gets a fully structured session the athlete can execute
// step-by-step. FIT capability is validated separately per sport. `variant`
// (the regeneration seed) rotates exercise selection deterministically —
// same seed, same session.

const STRENGTH_BLOCKS = [
  { pattern: "Squat", lifts: ["Back Squat", "Front Squat", "Goblet Squat", "Split Squat"] },
  { pattern: "Hinge", lifts: ["Romanian Deadlift", "Deadlift", "Single-leg RDL", "Kettlebell Swing"] },
  { pattern: "Press", lifts: ["Bench Press", "Overhead Press", "Incline DB Press", "Push Press"] },
  { pattern: "Pull", lifts: ["Pull-up", "Bent-over Row", "Single-arm Row", "Lat Pulldown"] },
];

function strengthSteps(minutes: number, zone: string, type: string, variant: number): WorkoutStep[] {
  const total = minutes * 60;
  const warm = Math.round(total * 0.12);
  const cool = Math.round(total * 0.08);
  const main = total - warm - cool;
  const pick = (i: number) => STRENGTH_BLOCKS[i].lifts[variant % STRENGTH_BLOCKS[i].lifts.length];
  const steps: WorkoutStep[] = [
    { name: "Warm-up — mobility + activation", seconds: warm, zone: "z1", phase: "warmup", note: "Hips/ankles/T-spine, band walks, 2 light ramp-in sets of the first lift" },
  ];
  // Main compound block ≈ 45% of main time: 4 sets × 5 reps with full rests.
  steps.push({
    name: `${pick(0)} + ${pick(1)}`,
    seconds: Math.round(main * 0.45), zone: type === "plyo" ? "z3" : zone, phase: "active",
    reps: 20, note: "2 lifts, 4 sets × 5 reps each, 2-3 min rest between sets — leave 2 reps in reserve",
  });
  // Accessory ≈ 30%: 3 × 10.
  steps.push({
    name: `${pick(2)} + ${pick(3)}`,
    seconds: Math.round(main * 0.3), zone: "z2", phase: "active",
    reps: 30, note: "3 sets × 10 reps each, 60-90 s rest — controlled tempo, full range",
  });
  // Plyometrics stay in strength weeks (economy + injury resilience,
  // Ramírez-Campillo 2022) whenever time AND intensity allow — a z1/z2-capped
  // day skips them entirely (review finding: Z3 plyo inside an easy session).
  const capZ = Number(zone.slice(1)) || 2;
  if (main > 15 * 60 && type !== "recovery" && capZ >= 3) {
    steps.push({
      name: "Plyometrics — jumps",
      seconds: Math.round(main * 0.15), zone: "z3", phase: "active",
      reps: 15, note: "3 sets × 5: box jumps or broad jumps, FULL recovery between sets — quality of contact, not fatigue",
    });
  }
  // Core circuit fills whatever remains of the main block.
  const used = steps.slice(1).reduce((a, s) => a + s.seconds, 0);
  const coreSec = Math.max(0, main - used);
  if (coreSec >= 120) {
    steps.push({
      name: "Core circuit",
      seconds: coreSec, zone: "z2", phase: "active",
      reps: 36, note: "3 rounds: 12 dead bugs + 12 side planks/side + 12 bird dogs, no rest inside a round",
    });
  }
  steps.push({ name: "Cool-down", seconds: cool, zone: "z1", phase: "cooldown", note: "Stretch the trained patterns, 5 slow nasal breaths per position" });
  return steps;
}

const BOXING_FOCUSES = [
  ["Jab + cross timing", "slip and counter"],
  ["Hook combinations", "body-head alternation"],
  ["Footwork + angle changes", "pivot out after combos"],
  ["Uppercuts in close", "clinch escape"],
];

function boxingSteps(minutes: number, variant: number, capZone = 5): WorkoutStep[] {
  const total = minutes * 60;
  const warm = Math.round(total * 0.15);
  const cool = Math.round(total * 0.1);
  const main = total - warm - cool;
  // Zone cap: an easy/capped day gets technical rounds at the capped zone —
  // never Z5 war in a Z2 prescription (review finding).
  const roundZone = "z" + Math.min(capZone, 5);
  const roundIntensity = capZone <= 2 ? "Technique — speed 50-60%, no power" : "Combinations of 3-5 punches, exhale on every strike";
  const steps: WorkoutStep[] = [
    { name: "Warm-up — rope + shadow", seconds: warm, zone: "z1", phase: "warmup", note: "Jump rope 2×3 min, shadow boxing 3 rounds of technique only" },
  ];
  // Pack as many full 3-min + 1-min rounds as the main budget ACTUALLY holds
  // (a 10-min session gets 2 rounds, not an overrunning 14.5 minutes).
  const roundLen = 240;
  const rounds = Math.max(2, Math.floor(main / roundLen));
  const usedRounds = Math.min(rounds, Math.floor(main / roundLen));
  for (let i = 0; i < usedRounds; i++) {
    const focus = BOXING_FOCUSES[(i + variant) % BOXING_FOCUSES.length];
    steps.push({
      name: `Round ${i + 1} — ${focus[0]}`,
      seconds: 180, zone: roundZone, phase: "active",
      note: `Technical focus: ${focus[1]}. ${roundIntensity}`,
    });
    steps.push({ name: "Rest between rounds", seconds: 60, zone: "z1", phase: "recovery", note: "Sit, breathe 4-6 in/out, sip — 30 s of the rest seated" });
  }
  steps.push({ name: "Cool-down", seconds: cool, zone: "z1", phase: "cooldown", note: "Light bag touches + neck/hand mobility" });
  // Total steps never exceed the session budget: trim the cool-down if rounds
  // used the reserve, so exports and reality agree.
  const stepTotal = steps.reduce((a, s) => a + s.seconds, 0);
  if (stepTotal > total) {
    const last = steps[steps.length - 1];
    last.seconds = Math.max(60, last.seconds - (stepTotal - total));
  }
  return steps;
}

const HYROX_STATIONS = [
  { name: "Sled push emulation", note: "Heavy pushes or steep-incline treadmill walks — low position, short steps" },
  { name: "Wall balls", note: "Sets of 25, squat depth to full extension, exhale on the throw" },
  { name: "Lunge walks", note: "Weighted walking lunges — knee tracks over toes, controlled down" },
  { name: "Farmers carry", note: "Heavy carry 30-40 m laps — tall posture, grip is the limiter" },
  { name: "Row blocks", note: "500 m repeats at race effort — legs then arms, 1:2 drive-recovery rhythm" },
];

function hyroxSteps(minutes: number, variant: number, capZone = 4): WorkoutStep[] {
  const total = minutes * 60;
  const warm = Math.round(total * 0.12);
  const cool = Math.round(total * 0.08);
  const main = total - warm - cool;
  // Station blocks follow the session's capped zone — an easy day is easy
  // everywhere (review finding: Z4 blocks inside a Z2-capped prescription).
  const blockZone = "z" + Math.min(capZone, 4);
  const blockPace = capZone <= 2 ? "conversational effort — this is an easy day" : "Hold your planned between-station 1 km pace — even effort, not sprint-and-die";
  const steps: WorkoutStep[] = [
    { name: "Warm-up — build to race HR", seconds: warm, zone: "z2", phase: "warmup", note: "Easy run 5 min, dynamic drills, 2 × 20 m accelerations" },
  ];
  // Alternating run + station blocks sized to the session.
  const stations = Math.max(2, Math.floor(main / (8 * 60)));
  const blockSec = Math.floor(main / (stations * 2));
  for (let i = 0; i < stations; i++) {
    const st = HYROX_STATIONS[(i + variant) % HYROX_STATIONS.length];
    steps.push({
      name: `Run ${i + 1} — race pace`,
      seconds: blockSec, zone: blockZone, phase: "active",
      note: blockPace,
    });
    steps.push({
      name: st.name,
      seconds: blockSec, zone: blockZone, phase: "active",
      note: st.note,
    });
  }
  steps.push({ name: "Cool-down", seconds: cool, zone: "z1", phase: "cooldown", note: "Easy walk/spin + hip flexor stretch (the stations load them)" });
  return steps;
}

// Fill unused budget with easy cooldown, never additional hard work. All
// generated time-only sessions must describe the complete prescribed duration.
function finishStructuredSteps(steps: WorkoutStep[], total: number, capZone: number): WorkoutStep[] {
  const result = steps.filter(s => s.seconds > 0).map(s => ({ ...s, zone: `z${Math.min(capZone, Number(s.zone.slice(1)))}` }));
  const used = result.reduce((sum, s) => sum + s.seconds, 0);
  if (used > total) throw new Error("Generated steps exceed the available session time.");
  const remaining = total - used;
  if (remaining > 0) {
    const cooldown = result[result.length - 1];
    if (cooldown?.phase === "cooldown" && !cooldown.reps) cooldown.seconds += remaining;
    else result.push({ name: "Easy finish", seconds: remaining, zone: "z1", phase: "cooldown" });
  }
  return result;
}

export function structuredSteps(
  minutes: number,
  zone: string,
  type: string,
  variant = 0,
  sport?: string,
): WorkoutStep[] {
  const total = Math.max(0, Math.round(minutes * 60));
  if (!total) return [];
  // Sport-aware detail: strength/plyo gets named lift blocks with sets×reps,
  // boxing gets rounds with rotating technical focus, HYROX gets run+station
  // emulation. Device export is separately validated and capability-gated.
  // The session's (possibly readiness-capped) zone governs every builder.
  const capZone = Number(zone.slice(1)) || 2;
  if (sport === "strength" || type === "strength" || type === "plyo")
    return finishStructuredSteps(strengthSteps(minutes, zone, type, variant), total, capZone);
  if (sport === "boxing")
    return finishStructuredSteps(boxingSteps(minutes, variant, capZone), total, capZone);
  if (sport === "hyrox")
    return finishStructuredSteps(hyroxSteps(minutes, variant, capZone), total, capZone);
  const warm = Math.round(total * 0.15),
    cool = Math.round(total * 0.1),
    main = total - warm - cool;
  const steps: WorkoutStep[] = [
    { name: "Warm up", seconds: warm, zone: "z1", phase: "warmup" },
  ];
  if (
    (["interval", "threshold"].includes(type) ||
      (variant > 0 && type !== "strength")) &&
    minutes >= 20
  ) {
    // Research-based set design (Seiler's polarized model; Billat 1:1 VO2max;
    // standard threshold cruise intervals) — pattern picked by the capped
    // zone, sized to the real main-set budget, and grouped under a
    // "Repeat N ×" header the athlete (and the .FIT export) can follow.
    const z = Math.min(7, Number(zone.slice(1)) || 2);
    type Pattern = {
      label: string;
      workSec: number;
      restSec: number;
      workZone: string;
      restZone: string;
      workName: string;
      restName: string;
      cite: string;
    };
    const patterns: Pattern[] = [
      { label: "Speed endurance", workSec: 30, restSec: 90, workZone: "z7", restZone: "z1", workName: "All-out surge", restName: "Float recovery", cite: "neural power + stride mechanics" },
      { label: "Rønnestad 30/15 short intervals", workSec: 30, restSec: 15, workZone: "z5", restZone: "z3", workName: "Hard — 30 s", restName: "Float — 15 s at ~50% work intensity", cite: "VO₂max, effort-matched head-to-head — ~2× the gain of long intervals, more time >90% VO₂max (Rønnestad 2015; Almquist 2020)" },
      { label: "80/160 VO₂max repeats", workSec: 80, restSec: 160, workZone: "z5", restZone: "z2", workName: "Hard — 80 s", restName: "Easy — 160 s", cite: "VO₂max domain (Zone 3) intervals (Trube, citing Ronnestad lineage)" },
      { label: "VO₂max repeats · 1:1", workSec: 180, restSec: 180, workZone: "z5", restZone: "z2", workName: "Hard — VO₂max", restName: "Easy — float at Z2", cite: "aerobic power (Seiler 2010)" },
      { label: "Sweet spot", workSec: 720, restSec: 180, workZone: "z3", restZone: "z1", workName: "Sweet-spot block", restName: "Easy spin", cite: "sustainable power" },
      { label: "Threshold cruise intervals · 2×", workSec: 1200, restSec: 180, workZone: "z4", restZone: "z2", workName: "Threshold block", restName: "Easy recovery", cite: "lactate threshold (Stepto 1999)" },
    ];
    // Pick by intended zone (interval z5-7 → VO2/speed; z4 → threshold; z3 → sweet spot).
    // Default z5-6 VO2max work is the Rønnestad 30/15 — the effort-matched
    // head-to-head winner. The regeneration variant rotates to 80/160 and the
    // classic 1:1 repeats so athletes get variety across the block.
    const vo2Variant = [1, 2, 3]; // Rønnestad, 80/160, 1:1
    const idx = z <= 2 ? 4 : z === 3 ? 4 : z === 4 ? 5 : z <= 6 ? vo2Variant[variant % vo2Variant.length] : 0;
    const pat = z <= 2
      ? { ...patterns[4], label: "Easy technique repeats", workZone: zone, workName: "Easy effort", restName: "Easy recovery", cite: "conservative effort; not threshold work" }
      : patterns[idx];
    const block = pat.workSec + pat.restSec;
    let reps = Math.max(2, Math.floor(main / block));
    // Whole-set guarantee: never exceed the main budget (rounding safety).
    while (reps > 2 && reps * block > main) reps--;
    // Scale first so displayed repeat labels describe the actual endpoints.
    const scale = Math.min(1, main / (reps * block));
    const workSeconds = Math.max(20, Math.floor(pat.workSec * scale));
    const workLabel = workSeconds < 60 ? `${workSeconds} s` : `${Math.floor(workSeconds / 60)} min${workSeconds % 60 ? ` ${workSeconds % 60} s` : ""}`;
    const group = `Repeat ${reps} × ${workLabel} — ${pat.label} (${pat.cite})`;
    for (let i = 0; i < reps; i++) {
      steps.push({
        name: `${pat.workName} ${i + 1}/${reps}`,
        seconds: workSeconds,
        zone: pat.workZone === "z7" && z < 7 ? zone : pat.workZone,
        phase: "active",
        group,
      });
      if (i < reps - 1)
        steps.push({
          name: pat.restName,
          seconds: Math.max(15, Math.floor(pat.restSec * scale)),
          zone: pat.restZone,
          phase: "recovery",
          group,
        });
    }
  } else
    steps.push({
      name: type === "strength" ? "Strength session" : "Steady effort",
      seconds: main,
      zone,
      phase: "active",
    });
  steps.push({
    name: "Cool down",
    seconds: cool,
    zone: "z1",
    phase: "cooldown",
  });
  return finishStructuredSteps(steps, total, capZone);
}
export function stepsText(steps: WorkoutStep[]) {
  return steps
    .filter((s) => s.phase === "active" || s.phase === "recovery")
    .map(
      (s) =>
        `${s.name}: ${Math.floor(s.seconds / 60)}:${String(s.seconds % 60).padStart(2, "0")} at ${s.zone.toUpperCase()}`,
    )
    .join("; ");
}
export function zoneTargets(
  zone: string,
  sport: string,
  profile?: {
    lthr?: number | null;
    ftp?: number | null;
    runPaceBase?: number | null;
    units?: string | null;
  } | null,
) {
  const z = Math.max(1, Math.min(7, Number(zone.slice(1)) || 2));
  const imperial = profile?.units === "imperial";
  const targets: { rpe: number; hr?: string; power?: string; pace?: string } = {
    rpe: [0, 2, 3, 5, 7, 8, 9, 10][z],
  };
  if (profile?.lthr)
    targets.hr = `≤${Math.round(profile.lthr * [0, 0.8, 0.89, 0.94, 1, 1.05, 1.1, 1.1][z])} bpm`;
  if (sport === "bike" && profile?.ftp)
    targets.power = `≤${Math.round(profile.ftp * [0, 0.55, 0.75, 0.9, 1.05, 1.2, 1.5, 1.5][z])} W`;
  if (sport === "run" && profile?.runPaceBase) {
    const KM_PER_MI = 1.609344;
    let secPerKm =
      profile.runPaceBase * [0, 1.4, 1.2, 1.08, 1, 0.95, 0.9, 0.85][z];
    if (imperial) secPerKm *= KM_PER_MI; // convert to sec/mile
    const m = Math.floor(secPerKm / 60);
    targets.pace = `~${m}:${String(Math.round(secPerKm - m * 60)).padStart(2, "0")}/${imperial ? "mi" : "km"}`;
  }
  return targets;
}

// ---- Session summary estimates (TrainingPeaks-style header) ----
const BIKE_KPH: Record<number, number> = { 1: 22, 2: 27, 3: 31, 4: 35, 5: 39, 6: 43, 7: 46 };
const SWIM_SEC_PER_100: Record<number, number> = { 1: 130, 2: 120, 3: 112, 4: 105, 5: 98, 6: 92, 7: 88 };

export function estimateDistanceKm(
  sport: string,
  zone: string,
  durationMin: number,
  profile?: { runPaceBase?: number | null; swimPaceBase?: number | null } | null,
): number | undefined {
  if (durationMin <= 0) return undefined;
  const z = Math.max(1, Math.min(7, Number(zone.slice(1)) || 2));
  const hours = durationMin / 60;
  if (sport === "run") {
    const pace = profile?.runPaceBase
      ? profile.runPaceBase * [0, 1.4, 1.2, 1.08, 1, 0.95, 0.9, 0.85][z]
      : z >= 5 ? 275 : z >= 4 ? 315 : z >= 3 ? 350 : 400; // sec/km defaults
    return +((durationMin * 60) / pace).toFixed(2);
  }
  if (sport === "bike") return +(BIKE_KPH[z] * hours).toFixed(1);
  if (sport === "swim") {
    const pace100 = profile?.swimPaceBase
      ? profile.swimPaceBase * [0, 1.35, 1.18, 1.08, 1, 0.95, 0.9, 0.85][z]
      : SWIM_SEC_PER_100[z];
    return +(((durationMin * 60) / pace100) * 0.1).toFixed(2);
  }
  return undefined;
}

export function estimateIf(
  zone: string,
  tss: number,
  durationMin: number,
): number | undefined {
  if (durationMin <= 0 || tss <= 0) return undefined;
  return +(tss / ((durationMin / 60) * 100)).toFixed(2);
}export function baseWorkout(w: any) {
  if (w.originalPlan) {
    try {
      return JSON.parse(w.originalPlan);
    } catch {}
  }
  return {
    title: w.title,
    sport: w.sport,
    type: w.type,
    intensity: w.intensity || "z2",
    durationMin: w.durationMin,
    description: w.notes || w.planDay?.notes || "",
    startTime: w.startTime || null,
  };
}
