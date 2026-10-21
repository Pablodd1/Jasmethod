import {hasWorkoutReport} from "./calendar-workouts";

/** Retiring a suggestion is not a report of performed or unknown training. */
export function isUnperformedSupersededWorkout(workout: Record<string, unknown>): boolean {
  if (!["superseded-plan", "superseded-starter", "superseded-starter-rest"].includes(String(workout.source))) return false;
  return !hasWorkoutReport(workout);
}
