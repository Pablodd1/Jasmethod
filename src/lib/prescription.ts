export interface WorkoutStep {
  name: string;
  seconds: number;
  zone: string;
  phase: "warmup" | "active" | "recovery" | "cooldown";
  reps?: number;
  note?: string;
  target?: { type: "open" | "power" | "heartRate"; low?: number; high?: number };
}
export function structuredSteps(
  minutes: number,
  zone: string,
  type: string,
  variant = 0,
): WorkoutStep[] {
  const total = Math.max(0, Math.round(minutes * 60));
  if (!total) return [];
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
  if (sport === "run" && profile?.runPaceBase)
    targets.pace = `~${Math.round(profile.runPaceBase * [0, 1.4, 1.2, 1.08, 1, 0.95, 0.9, 0.85][z])} sec/km`;
  return targets;
}
export function baseWorkout(w: any) {
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
