import { createHash, timingSafeEqual } from "node:crypto";
import { fromZonedTime } from "date-fns-tz";
import { localDate, dateKey, addDaysKey } from "./dates";
import { prisma } from "./db";
import { storeActivity, deleteImportedActivities } from "./activity-store";
import { getIntervalsAuthorization, intervalsScopesAllow } from "./intervals-oauth";
import { requireIntervalsConnector } from "./capabilities";

// Field contract: https://intervals.icu/api/v1/docs (Activity, Wellness).
// Intervals hrv is RMSSD; hrvSDNN is retained separately, never converted.
const allowedSources = new Set(["UPLOAD", "MANUAL", "GARMIN_CONNECT", "OAUTH_CLIENT", "DROPBOX", "POLAR", "SUUNTO", "COROS", "WAHOO", "ZWIFT", "ZEPP", "CONCEPT2", "HUAWEI"]);
const number = (v: unknown, min: number, max: number): number | null => typeof v === "number" && Number.isFinite(v) && v >= min && v <= max ? v : null;
export function mapIntervalsActivity(a: any, athleteId: string, timezone: string) {
  if (!a || !allowedSources.has(a.source)) return null; // Includes STRAVA and unknown provenance.
  if (a.icu_athlete_id != null && String(a.icu_athlete_id) !== athleteId) throw new Error("Intervals activity athlete mismatch");
  if (typeof a.id !== "string" || !a.id || a.id.length > 128) throw new Error("Invalid Intervals activity identifier");
  const duration = number(a.moving_time, 1, 604800) ?? number(a.elapsed_time, 1, 604800);
  let date: Date;
  if (typeof a.start_date === "string" && /(?:Z|[+-]\d\d:\d\d)$/.test(a.start_date)) date = new Date(a.start_date);
  else if (typeof a.start_date_local === "string" && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d$/.test(a.start_date_local)) date = fromZonedTime(a.start_date_local, timezone);
  else throw new Error("Invalid Intervals activity date");
  if (!duration || !Number.isFinite(date.getTime())) throw new Error("Invalid Intervals activity duration or date");
  const type = String(a.type || "").toLowerCase();
  const sport = /ride|cycling|bike/.test(type) ? "bike" : /run/.test(type) ? "run" : /swim/.test(type) ? "swim" : /weight|strength/.test(type) ? "strength" : "other";
  const rounded = (v: unknown, min: number, max: number) => { const n = number(v, min, max); return n == null ? null : Math.round(n); };
  const distance = number(a.distance, 0, 10000000);
  return { externalId: `intervals:${a.id}`, source: "intervals", date, sport,
    notes: `Imported via Intervals.icu. Original source: ${a.source}.${typeof a.device_name === "string" ? ` Device: ${a.device_name.slice(0, 120)}.` : ""} Recorded duration: ${duration} seconds.`,
    title: typeof a.name === "string" ? a.name.slice(0, 200) : "Imported activity",
    durationMin: Math.max(1, Math.round(duration / 60)), distanceKm: distance == null ? null : distance / 1000,
    avgHr: rounded(a.average_heartrate, 20, 250), maxHr: rounded(a.max_heartrate, 20, 250),
    avgPower: rounded(a.icu_average_watts, 0, 5000), np: rounded(a.icu_weighted_avg_watts, 0, 5000),
    // Intervals load can be HR/pace/power-derived; do not label it measured TSS.
    calories: rounded(a.calories, 0, 50000),
  };
}
export function mapIntervalsWellness(w: any, timezone: string) {
  if (!w || typeof w.id !== "string") throw new Error("Invalid Intervals wellness date");
  const date = localDate(w.id, timezone);
  const hrv = number(w.hrv, 1, 500), restingHr = number(w.restingHR, 20, 250), sleep = number(w.sleepSecs, 0, 86400);
  const sleepScore = number(w.sleepScore, 0, 100);
  const data = { ...(hrv == null ? {} : { hrv, hrvType: "rmssd" }), ...(restingHr == null ? {} : { restingHr: Math.round(restingHr) }),
    ...(sleep == null ? {} : { sleepHours: sleep / 3600 }), ...(sleepScore == null ? {} : { sleepScore: Math.round(sleepScore) }) };
  const observations: { metricType: string; value: number; unit: string }[] = [];
  const put = (metricType: string, value: number | null, unit: string) => { if (value != null) observations.push({ metricType, value, unit }); };
  put("hrv_rmssd", hrv, "ms"); put("hrv_sdnn", number(w.hrvSDNN, 1, 500), "ms"); put("resting_hr", restingHr, "bpm");
  put("sleep_hours", sleep == null ? null : sleep / 3600, "h"); put("sleep_score", sleepScore, "score");
  put("weight_kg", number(w.weight, 20, 400), "kg"); put("steps", number(w.steps, 0, 200000), "count");
  // readiness and subjective scales aren't equated to another provider's recovery score.
  return { date, data, observations };
}
export async function intervalsRead(path: string, authorization: string, fetcher: typeof fetch = fetch): Promise<any> {
  const response = await fetcher(`https://intervals.icu/api/v1${path}`, { headers: { Authorization: authorization, Accept: "application/json" }, cache: "no-store", redirect: "error", signal: AbortSignal.timeout(20000) });
  if (!response.ok) throw Object.assign(new Error(response.status === 401 || response.status === 403 ? "Intervals authorization or scope expired. Reconnect this provider." : `Intervals read failed (${response.status})`), { status: response.status });
  return response.json();
}
export async function fetchIntervalsRange(authorization: string, oldest: string, newest: string, activity: boolean, wellness: boolean, fetcher: typeof fetch = fetch) {
  const rows: { activities: any[]; wellness: any[] } = { activities: [], wellness: [] };
  for (let start = oldest; start <= newest; start = addDaysKey(start, 30)) {
    const end = addDaysKey(start, 29) < newest ? addDaysKey(start, 29) : newest;
    const query = new URLSearchParams({ oldest: start, newest: end });
    const [a, w] = await Promise.all([
      activity ? intervalsRead(`/athlete/0/activities?${query}`, authorization, fetcher) : [],
      wellness ? intervalsRead(`/athlete/0/wellness?${query}`, authorization, fetcher) : [],
    ]);
    if (!Array.isArray(a) || !Array.isArray(w)) throw new Error("Invalid Intervals list response");
    rows.activities.push(...a); rows.wellness.push(...w);
  }
  return rows;
}
async function storeWellness(userId: string, timezone: string, w: any) {
  const mapped = mapIntervalsWellness(w, timezone);
  const { persistDeviceDay } = await import("./sync");
  await prisma.$transaction(async tx => persistDeviceDay(tx, userId, mapped.date, "intervals", mapped.data,
    mapped.observations.map(o => ({ ...o, userId, observedAt: mapped.date, source: "intervals", measurementMethod: "device_sync", qualityFlag: "incomplete" }))));
}
export async function ingestIntervals(userId: string, timezone: string, conn: { scope: string | null; lastSyncAt: Date | null }, fullHistory = false) {
  const { authorization, athleteId } = await getIntervalsAuthorization(userId, []);
  const activity = intervalsScopesAllow(conn.scope, ["ACTIVITY:READ"]), wellness = intervalsScopesAllow(conn.scope, ["WELLNESS:READ"]);
  if (!activity && !wellness) throw new Error("Intervals activity or wellness read permission required. Reconnect this provider.");
  const newest = dateKey(new Date(), timezone), oldest = addDaysKey(newest, !conn.lastSyncAt || fullHistory ? -179 : -7);
  const rows = await fetchIntervalsRange(authorization, oldest, newest, activity, wellness);
  const current = await getIntervalsAuthorization(userId, []);
  if (current.authorization !== authorization || current.athleteId !== athleteId) throw new Error("Intervals connection changed during sync");
  let imported = 0;
  for (const a of rows.activities.sort((a, b) => String(a.start_date_local).localeCompare(String(b.start_date_local)))) {
    const mapped = mapIntervalsActivity(a, athleteId, timezone);
    if (mapped && await storeActivity(userId, timezone, mapped)) imported++;
  }
  for (const w of rows.wellness) { await storeWellness(userId, timezone, w); imported++; }
  return imported;
}
export const intervalsEventTypes = new Set(["ACTIVITY_UPLOADED", "ACTIVITY_ANALYZED", "ACTIVITY_UPDATED", "ACTIVITY_DELETED", "WELLNESS_UPDATED", "CALENDAR_UPDATED"]);
export function intervalsEventHash(event: unknown): string {
  const stable = (v: any): any => Array.isArray(v) ? v.map(stable) : v && typeof v === "object" ? Object.fromEntries(Object.keys(v).sort().map(k => [k, stable(v[k])])) : v;
  return createHash("sha256").update(JSON.stringify(stable(event))).digest("hex");
}
export function intervalsSecretMatches(candidate: unknown, secret: string): boolean {
  return typeof candidate === "string" && timingSafeEqual(createHash("sha256").update(candidate).digest(), createHash("sha256").update(secret).digest());
}
export async function processIntervalsEvent(userId: string, payload: any) {
  requireIntervalsConnector();
  const event = payload.event;
  const conn = await prisma.connector.findFirst({ where: { id: payload.connectorId, userId, provider: "intervals", externalRef: String(event.athlete_id), status: { in: ["connected", "error"] } } });
  if (!conn) return; // Revoked/replaced connection must not resume an old job.
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { timezone: true } });
  if (event.type === "CALENDAR_UPDATED") {
    const { reconcileIntervalsPublications } = await import("./intervals-delivery");
    await reconcileIntervalsPublications(userId); return;
  }
  if (event.type.startsWith("ACTIVITY_")) {
    const { authorization, athleteId } = await getIntervalsAuthorization(userId, ["ACTIVITY:READ"]);
    const id = event.activity?.id;
    if (typeof id !== "string" || !id || id.length > 128) throw new Error("Activity webhook lacks an identifier");
    let activity: any;
    try { activity = await intervalsRead(`/activity/${encodeURIComponent(id)}`, authorization); }
    catch (error: any) {
      if (error.status !== 404) throw error;
      await deleteImportedActivities(userId, "intervals", [`intervals:${id}`]); return;
    }
    if (String(activity.icu_athlete_id) !== athleteId || activity.id !== id) throw new Error("Activity ownership not verified");
    const mapped = mapIntervalsActivity(activity, athleteId, user.timezone);
    if (mapped) await storeActivity(userId, user.timezone, mapped);
    else await deleteImportedActivities(userId, "intervals", [`intervals:${id}`]);
    return;
  }
  if (event.type === "WELLNESS_UPDATED") {
    const { authorization } = await getIntervalsAuthorization(userId, ["WELLNESS:READ"]);
    const newest = dateKey(new Date(), user.timezone);
    const rows = await fetchIntervalsRange(authorization, addDaysKey(newest, -7), newest, false, true);
    for (const row of rows.wellness) await storeWellness(userId, user.timezone, row);
  }
}
