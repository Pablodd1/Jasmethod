import { Encoder, Profile } from "@garmin/fitsdk";
import { structuredSteps, type WorkoutStep } from "./prescription";
import { buildProtocol, protocolFromWorkout } from "./protocols";

export function workoutToFitSpec(
  w: {
    title: string;
    sport: string;
    durationMin: number;
    lthr?: number | null;
    ftp?: number | null;
    type?: string;
    prescription?: string | null;
    originalPlan?: string | null;
  },
  detail?: { zone?: string | null },
) {
  let steps: WorkoutStep[] = structuredSteps(
    w.durationMin,
    detail?.zone || "z2",
    w.type || "endurance",
    0,
    w.sport,
  );
  if (w.prescription) {
    try {
      const saved = JSON.parse(w.prescription);
      if (Array.isArray(saved.steps)) steps = saved.steps;
    } catch {}
  }
  else {
    const protocol = protocolFromWorkout(w);
    if (protocol) steps = buildProtocol(protocol, w.durationMin).steps;
  }
  return { ...w, steps };
}
export function buildFitWorkout(
  spec: ReturnType<typeof workoutToFitSpec>,
  created = new Date(),
): Uint8Array {
  if (!spec.steps.length) throw new Error("Rest day has no workout to export");
  const encoder = new Encoder();
  encoder.onMesg(Profile.MesgNum.FILE_ID, {
    type: "workout",
    manufacturer: "development",
    product: 1,
    timeCreated: created,
  } as any);
  encoder.onMesg(Profile.MesgNum.WORKOUT, {
    wktName: Array.from(spec.title).slice(0, 40).join(""),
    sport:
      spec.sport === "run"
        ? "running"
        : spec.sport === "bike"
          ? "cycling"
          : spec.sport === "swim"
            ? "swimming"
            : "generic",
    numValidSteps: spec.steps.length,
  } as any);
  spec.steps.forEach((step, i) => {
    const zone = Math.max(1, Math.min(7, Number(step.zone.slice(1)) || 2));
    const power = step.target ? step.target.type === "power" : spec.sport === "bike" && spec.ftp;
    const heartRate = step.target ? step.target.type === "heartRate" : spec.lthr;
    const high = step.target
      ? step.target.high == null ? undefined : step.target.high + (power ? 1000 : 100)
      : power
      ? Math.round(
          spec.ftp! * [0, 0.55, 0.75, 0.9, 1.05, 1.2, 1.5, 1.5][zone],
        ) + 1000
      : spec.lthr
        ? Math.round(
            spec.lthr * [0, 0.8, 0.89, 0.94, 1, 1.05, 1.1, 1.1][zone],
          ) + 100
        : undefined;
    encoder.onMesg(Profile.MesgNum.WORKOUT_STEP, {
      messageIndex: i,
      wktStepName: step.name,
      durationType: step.reps ? "reps" : "time",
      durationValue: step.reps ?? step.seconds * 1000,
      intensity: step.phase,
      targetType: power ? "power" : heartRate ? "heartRate" : "open",
      targetValue: 0,
      ...(high
        ? {
            customTargetValueLow: (step.target?.low || 0) + (power ? 1000 : 100),
            customTargetValueHigh: high,
          }
        : {}),
    } as any);
  });
  return encoder.close();
}
