import { formatInTimeZone, fromZonedTime } from "date-fns-tz";

export const DEFAULT_TIMEZONE = "America/New_York";
export function dateKey(
  date = new Date(),
  timezone = DEFAULT_TIMEZONE,
): string {
  return formatInTimeZone(date, timezone, "yyyy-MM-dd");
}
export function addDaysKey(key: string, days: number): string {
  const d = new Date(`${key}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
export function localDate(
  key: string,
  timezone = DEFAULT_TIMEZONE,
  time = "00:00",
): Date {
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(key) ||
    !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)
  )
    throw new Error("Invalid date or time");
  const result = fromZonedTime(`${key}T${time}:00`, timezone);
  if (!Number.isFinite(result.getTime()) || dateKey(result, timezone) !== key)
    throw new Error("Invalid calendar date");
  return result;
}
export function dayBounds(timezone = DEFAULT_TIMEZONE, date = new Date()) {
  const key = dateKey(date, timezone);
  return {
    key,
    start: localDate(key, timezone),
    end: localDate(addDaysKey(key, 1), timezone),
  };
}
export function parseDate(
  value: string | Date,
  timezone = DEFAULT_TIMEZONE,
): Date {
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value))
    return localDate(value, timezone);
  const d = new Date(value);
  if (!Number.isFinite(d.getTime())) throw new Error("Invalid date");
  return d;
}
export function busyHours(
  events: { startTime?: string | null; endTime?: string | null; date?: Date }[],
  key: string,
  timezone: string,
): number {
  const start = localDate(key, timezone).getTime(),
    end = localDate(addDaysKey(key, 1), timezone).getTime();
  const intervals = events
    .flatMap((e) => {
      if (!e.startTime || !e.endTime) return [];
      const parse = (s: string) =>
        /^\d{2}:\d{2}$/.test(s)
          ? localDate(key, timezone, s).getTime()
          : new Date(s).getTime();
      const a = Math.max(start, parse(e.startTime)),
        b = Math.min(end, parse(e.endTime));
      return Number.isFinite(a) && Number.isFinite(b) && b > a ? [[a, b]] : [];
    })
    .sort((a, b) => a[0] - b[0]);
  let total = 0,
    until = start;
  for (const [a, b] of intervals) {
    total += Math.max(0, b - Math.max(a, until));
    until = Math.max(until, b);
  }
  return total / 3600000;
}
