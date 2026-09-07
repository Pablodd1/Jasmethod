import { prescribeToday } from "./adaptive";
import { baseWorkout } from "./prescription";
export function workoutDetail(workout: any, profile?: any) {
  if (workout.prescription) {
    try {
      return JSON.parse(workout.prescription).detail;
    } catch {}
  }
  return prescribeToday({
    session: baseWorkout(workout),
    adaptation: { verdict: "full", durationFactor: 1, intensityCap: "z7" },
    profile,
  }).detail;
}
