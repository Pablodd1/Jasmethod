import { Encoder, Profile } from "@garmin/fitsdk";
import { structuredSteps, type WorkoutStep } from "./prescription";

export function workoutToFitSpec(
  w: {
    title: string;
    sport: string;
    durationMin: number;
    lthr?: number | null;
    ftp?: number | null;
    type?: string;
    prescription?: string | null;
  },
  detail?: { zone?: string | null },
) {
  let steps: WorkoutStep[] = structuredSteps(
    w.durationMin,
    detail?.zone || "z2",
    w.type || "endurance",
  );
  if (w.prescription) {
    try {
      const saved = JSON.parse(w.prescription);
      if (Array.isArray(saved.steps)) steps = saved.steps;
    } catch {}
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
    const power = spec.sport === "bike" && spec.ftp;
    const high = power
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
      durationType: "time",
      durationValue: step.seconds * 1000,
      intensity: step.phase,
      targetType: power ? "power" : spec.lthr ? "heartRate" : "open",
      targetValue: 0,
      ...(high
        ? {
            customTargetValueLow: power ? 1000 : 100,
            customTargetValueHigh: high,
          }
        : {}),
    } as any);
  });
  return encoder.close();
}
