import { dateKey } from "./dates";
import { hrvReadiness } from "./science";

export function currentHrvReadiness(
  metrics: {
    date: Date;
    hrv: number | null;
    hrvType?: string | null;
    source?: string | null;
  }[],
  timezone: string,
  now = new Date(),
) {
  const ordered = metrics
    .filter((m) => m.hrv != null && m.hrv > 0 && new Date(m.date) <= now)
    .sort((a, b) => +new Date(a.date) - +new Date(b.date));
  const latest = ordered[ordered.length - 1];
  if (
    !latest ||
    dateKey(new Date(latest.date), timezone) !== dateKey(now, timezone) ||
    !latest.hrvType ||
    !latest.source
  )
    return null;
  const baseline = ordered
    .filter(
      (m) =>
        dateKey(new Date(m.date), timezone) !== dateKey(now, timezone) &&
        +new Date(m.date) >= +now - 28 * 86400000 &&
        m.hrvType === latest.hrvType &&
        m.source === latest.source,
    )
    .slice(-7)
    .map((m) => m.hrv!);
  if (baseline.length < 5) return null;
  const mean = baseline.reduce((sum, n) => sum + n, 0) / baseline.length;
  const sd = Math.sqrt(
    baseline.reduce((sum, n) => sum + (n - mean) ** 2, 0) / baseline.length,
  );
  const { score, advice } = hrvReadiness(latest.hrv!, baseline, sd);
  return { score, advice };
}
