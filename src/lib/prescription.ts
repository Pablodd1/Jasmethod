export interface WorkoutStep {
  name: string;
  seconds: number;
  zone: string;
  phase: "warmup" | "active" | "recovery" | "cooldown";
  reps?: number;
  note?: string;
  target?: { type: "open" | "power" | "heartRate"; low?: number; high?: number };
  targets?: { rpe: number; hr?: string; power?: string; pace?: string };
}

// ---- Sport-specific step builders (sets, reps, variations) ----
// Every training gets a fully structured session the athlete can execute
// step-by-step AND export to Garmin (.FIT) with per-step targets. `variant`
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
  // emulation — all exportable to Garmin with per-step targets and alerts.
  // The session's (possibly readiness-capped) zone governs every builder.
  const capZone = Number(zone.slice(1)) || 2;
  if (sport === "strength" || type === "strength" || type === "plyo")
    return strengthSteps(minutes, zone, type, variant);
  if (sport === "boxing")
    return boxingSteps(minutes, variant, capZone);
  if (sport === "hyrox")
    return hyroxSteps(minutes, variant, capZone);
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
    const reps = variant
      ? 2 + variant
      : Math.min(6, Math.max(2, Math.floor(main / 300)));
    const recovery = Math.round((main * 0.25) / (reps - 1));
    const work = Math.floor((main - recovery * (reps - 1)) / reps);
    for (let i = 0; i < reps; i++) {
      steps.push({
        name: `Effort ${i + 1}`,
        seconds:
          i === reps - 1
            ? main - recovery * (reps - 1) - work * (reps - 1)
            : work,
        zone,
        phase: "active",
      });
      if (i < reps - 1)
        steps.push({
          name: "Easy recovery",
          seconds: recovery,
          zone: "z1",
          phase: "recovery",
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
  return steps;
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
  } | null,
) {
  const z = Math.max(1, Math.min(7, Number(zone.slice(1)) || 2));
  const targets: { rpe: number; hr?: string; power?: string; pace?: string } = {
    rpe: [0, 2, 3, 5, 7, 8, 9, 10][z],
  };
  if (profile?.lthr)
    targets.hr = `≤${Math.round(profile.lthr * [0, 0.8, 0.89, 0.94, 1, 1.05, 1.1, 1.1][z])} bpm`;
  if (sport === "bike" && profile?.ftp)
    targets.power = `≤${Math.round(profile.ftp * [0, 0.55, 0.75, 0.9, 1.05, 1.2, 1.5, 1.5][z])} W`;
  if (sport === "run" && profile?.runPaceBase) {
    const secPerKm = Math.round(
      profile.runPaceBase * [0, 1.4, 1.2, 1.08, 1, 0.95, 0.9, 0.85][z],
    );
    const m = Math.floor(secPerKm / 60);
    targets.pace = `~${m}:${String(secPerKm - m * 60).padStart(2, "0")}/km`;
  }
  return targets;
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
