// JasMiamiMethod — Oura Ring export parser.
// Oura exports JSON files from the web dashboard (https://cloud.ouraring.com).
// Files: sleep.json, activity.json, readiness.json (or a combined oura_data.json)
// We parse sleep and readiness to fill DailyMetrics.

export interface OuraSleepEntry {
  date: string;          // YYYY-MM-DD
  score: number;         // 0-100 sleep score
  totalSleepDuration: number; // seconds
  deepSleepDuration: number;  // seconds
  remSleepDuration: number;   // seconds
  hrv?: number;          // rmssd
  restingHeartRate?: number;
}

export interface OuraReadinessEntry {
  day: string;
  score: number;         // 0-100 readiness
  hrv?: number;
  restingHeartRate?: number;
}

export interface OuraParsed {
  sleep: OuraSleepEntry[];
  readiness: OuraReadinessEntry[];
  metrics: {
    date: string;
    hrv: number | null;
    restingHr: number | null;
    sleepHours: number | null;
    sleepScore: number | null;
    recoveryScore: number | null;
  }[];
}

export function parseOuraExport(json: string): OuraParsed {
  const data = JSON.parse(json);
  const sleep: OuraSleepEntry[] = [];
  const readiness: OuraReadinessEntry[] = [];

  // Oura cloud export format: array of sleep entries
  if (Array.isArray(data)) {
    for (const entry of data) {
      const day = entry.day || entry.date || "";
      if (!day) continue;
      if (entry.score != null && entry.contributors != null) {
        // Readiness entry (has contributors object)
        readiness.push({
          day,
          score: entry.score,
          hrv: entry.contributors?.hrv_balance ?? entry.contributors?.hrv ?? null,
          restingHeartRate: entry.contributors?.resting_heart_rate ?? null,
        });
      }
      if (entry.total_sleep_duration != null) {
        // Sleep entry
        sleep.push({
          date: day,
          score: entry.score ?? 0,
          totalSleepDuration: entry.total_sleep_duration ?? 0,
          deepSleepDuration: entry.deep_sleep_duration ?? 0,
          remSleepDuration: entry.rem_sleep_duration ?? 0,
          hrv: entry.rmssd ?? entry.hrv ?? null,
          restingHeartRate: entry.resting_heart_rate ?? null,
        });
      }
    }
  }

  // Oura API v2 format: { data: [...] }
  if (data?.data && Array.isArray(data.data)) {
    for (const entry of data.data) {
      const day = entry.day || "";
      if (!day) continue;
      if (entry.score != null && entry.contributors != null) {
        readiness.push({
          day,
          score: entry.score,
          hrv: entry.contributors?.hrv_balance ?? null,
          restingHeartRate: entry.contributors?.resting_heart_rate ?? null,
        });
      }
    }
  }

  // Merge sleep + readiness into daily metrics
  const metrics: OuraParsed["metrics"] = [];
  const byDate = new Map<string, any>();

  for (const s of sleep) {
    const existing = byDate.get(s.date) || {};
    existing.date = s.date;
    existing.sleepHours = s.totalSleepDuration ? Math.round(s.totalSleepDuration / 3600 * 10) / 10 : null;
    existing.sleepScore = s.score || null;
    existing.hrv = s.hrv ?? null;
    existing.restingHr = s.restingHeartRate ?? null;
    byDate.set(s.date, existing);
  }
  for (const r of readiness) {
    const existing = byDate.get(r.day) || {};
    existing.date = r.day;
    existing.recoveryScore = r.score ?? null;
    if (r.hrv) existing.hrv = r.hrv;
    if (r.restingHeartRate) existing.restingHr = r.restingHeartRate;
    byDate.set(r.day, existing);
  }

  for (const [, v] of Array.from(byDate.values())) metrics.push(v);
  metrics.sort((a, b) => (a.date < b.date ? -1 : 1));

  return { sleep, readiness, metrics };
}
