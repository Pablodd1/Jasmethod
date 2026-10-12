// Wholly synthetic design/QA fixture, never imported into an athlete account.
import { canonicalSession } from "./canonical-session";
import { buildUniversalWorkoutCard } from "./universal-workout-card-server";
export function universalWorkoutExample(language: "en" | "es" = "en") {
  const step = (
    name: string,
    seconds: number,
    zone: string,
    phase: string,
    group?: string,
  ) => ({ name, seconds, zone, phase, group, target: { type: "open" } });
  const steps = [
    step("Warm-up", 900, "z2", "warmup"),
    {
      repeat: 4,
      steps: [
        step("Relaxed stride", 20, "z4", "active", "Strides"),
        step("Easy jog", 40, "z1", "recovery", "Strides"),
      ],
    },
    ...Array.from({ length: 5 }, (_, i) => [
      step(`5K effort ${i + 1}`, 180, "z5", "active", "Main set"),
      ...(i < 4
        ? [step("Easy recovery", 180, "z1", "recovery", "Main set")]
        : []),
    ]).flat(),
    step("Cool-down", 600, "z1", "cooldown"),
  ];
  const session = canonicalSession({
    athleteId: "synthetic-card-athlete",
    workout: {
      id: "synthetic-card-session",
      title: language === "es" ? "Carrera VO₂max" : "VO₂max Run",
      sport: "run",
      durationMin: 56,
    },
    prescription: { sport: "run", durationMin: 56, verdict: "full", steps },
    dateLocal: "2026-10-14",
    timezone: "America/New_York",
  });
  return buildUniversalWorkoutCard(session, null, language);
}
