import { addDaysKey, dateKey } from "./dates";
import { validCycleDateKey } from "./cycle-events";

/** Browser-safe presentation of saved cycle dates; no provider or hashing code. */
export function savedCycleSummary(plan: { id: string; name: string; startDate: Date | string; weeks: number; raceDate?: Date | string | null }, timezone: string, today = dateKey(new Date(), timezone)) {
  const calendarKey = (value: Date | string) => validCycleDateKey(value) ? value : dateKey(new Date(value), timezone);
  const start = calendarKey(plan.startDate);
  const end = addDaysKey(start, plan.weeks * 7 - 1);
  const elapsed = Math.floor((Date.parse(today) - Date.parse(start)) / 86400000);
  return { id: plan.id, name: plan.name, start, end, weeks: plan.weeks,
    currentWeek: elapsed < 0 || today > end ? null : Math.floor(elapsed / 7) + 1,
    status: today < start ? "upcoming" : today > end ? "ended" : "active",
    raceDate: plan.raceDate ? calendarKey(plan.raceDate) : null };
}
