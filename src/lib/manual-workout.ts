import { dateKey, localDate } from "./dates";
import { optionalCheckinNumber } from "./checkin-safety";
export const MANUAL_SPORTS = ["run", "bike", "swim", "strength", "mobility", "recovery", "brick", "hyrox", "boxing", "other"];
/** Explicit athlete report; missing duration is rejected rather than stored as 0/30. */
export function parseManualWorkout(value: unknown, timezone: string, now = new Date()) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Expected an activity report");
  const b = value as Record<string, unknown>;
  if (typeof b.sport !== "string" || !MANUAL_SPORTS.includes(b.sport)) throw new Error("Choose the sport you actually did");
  if (typeof b.date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(b.date)) throw new Error("Choose the local date of the activity");
  const observedDate = localDate(b.date, timezone);
  if (b.date > dateKey(now, timezone)) throw new Error("Actual activity cannot be logged for a future day");
  const actualDurationMin = optionalCheckinNumber(b.actualDurationMin ?? b.durationMin, "actual duration", 1, 1440, true);
  if (actualDurationMin == null) throw new Error("Enter actual minutes to create an unplanned activity. Unknown duration cannot be stored as zero or as a planned duration.");
  const values: Record<string, number | null> = {};
  for (const [key, max] of Object.entries({ distanceKm: 1500, reps: 100000, loadKg: 1500 })) values[key] = optionalCheckinNumber(b[key], key, 0, max, key === "reps") ?? null;
  const optionalMeasurements: Record<string, number | null> = {};
  for (const [key, range] of Object.entries({ avgHr: [20, 240], maxHr: [20, 250], avgPower: [0, 2500], np: [0, 2500], calories: [0, 20000], preWeightKg: [20, 350], postWeightKg: [20, 350] })) {
    if (b[key] !== undefined) optionalMeasurements[key] = optionalCheckinNumber(b[key], key, range[0], range[1], ["avgHr", "maxHr", "calories"].includes(key)) ?? null;
  }
  const rpe = optionalCheckinNumber(b.rpe, "RPE", 0, 10, true) ?? null;
  if (b.title != null && typeof b.title !== "string") throw new Error("Invalid title");
  if (b.notes != null && typeof b.notes !== "string") throw new Error("Invalid activity notes");
  return {
    ...optionalMeasurements,
    date: observedDate, sport: b.sport, actualSport: b.sport,
    title: typeof b.title === "string" && b.title.trim() ? b.title.trim().slice(0, 200) : `Reported ${b.sport} activity`,
    type: "manual", durationMin: actualDurationMin, actualDurationMin,
    rpe, distanceKm: values.distanceKm, notes: typeof b.notes === "string" ? b.notes.trim().slice(0, 4000) : null,
    feedbackNote: typeof b.notes === "string" ? b.notes.trim().slice(0, 4000) : null,
    actualDetails: JSON.stringify({ schemaVersion: 1, source: "athlete_report", observedDate: b.date, enteredAt: now.toISOString(), values }),
    planned: false, completed: true, feedbackStatus: "completed", feedbackAt: now, source: "manual",
  };
}
