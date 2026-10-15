/** Retiring a suggestion is not a report of performed or unknown training. */
export function isUnperformedSupersededWorkout(workout: Record<string, unknown>): boolean {
  if (!["superseded-plan", "superseded-starter", "superseded-starter-rest"].includes(String(workout.source))) return false;
  if (workout.completed === true) return false;
  return ["feedbackAt", "feedbackStatus", "feedbackNote", "actualDurationMin", "actualSport", "actualDetails", "rpe",
    "avgHr", "maxHr", "avgPower", "np", "distanceKm", "preWeightKg", "postWeightKg", "externalId", "matchedPlanId"]
    .every(field => workout[field] == null);
}
