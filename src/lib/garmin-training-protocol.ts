import { GarminError } from "./garmin-config";
import type { GarminWorkoutPayload } from "./garmin-workout";

export type GarminRemoteWorkout = { workoutId: number; ownerId: number; workoutName: string; sport: string; segments: unknown[] };
export type GarminSchedule = { scheduleId: number; workoutId: number; date: string };
export class GarminTrainingError extends GarminError {
  constructor(code: string, public readonly uncertain: boolean, public readonly retryAfterMs = 0) {
    super(code, code === "garmin_rate_limited" ? "Garmin rate limit reached; delivery is paused." : "Garmin delivery could not be verified. Review its status before retrying.", 503);
  }
}
const id = (v: unknown): v is number => typeof v === "number" && Number.isSafeInteger(v) && v > 0;
const obj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
export function parseGarminSchedule(value: unknown): GarminSchedule {
  if (!obj(value) || !id(value.scheduleId) || !id(value.workoutId) || typeof value.date !== "string" || !/^\d{4}-\d\d-\d\d$/.test(value.date)) throw new GarminTrainingError("invalid_schedule", true);
  return value as GarminSchedule;
}
export function parseGarminWorkout(value: unknown): GarminRemoteWorkout {
  if (!obj(value) || !id(value.workoutId) || !id(value.ownerId) || typeof value.workoutName !== "string" || typeof value.sport !== "string" || !Array.isArray(value.segments)) throw new GarminTrainingError("invalid_workout", true);
  return value as GarminRemoteWorkout;
}
/** Fixed October 2026 endpoints, no credential-bearing callback URLs or endpoint fallbacks. */
export function createGarminTrainingProtocol(fetcher: typeof fetch = fetch) {
  async function request(token: string, path: string, method = "GET", body?: unknown): Promise<unknown> {
    let response: Response;
    try { response = await fetcher(`https://apis.garmin.com${path}`, { method, headers: { Authorization: `Bearer ${token}`, Accept: "application/json", ...(body ? {"Content-Type":"application/json"} : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}), redirect: "error", cache: "no-store", signal: AbortSignal.timeout(15000) }); }
    catch (error) {
      if (error instanceof GarminError && error.code === "local_garmin_budget") throw new GarminTrainingError("garmin_rate_limited", false, 60000);
      throw new GarminTrainingError("garmin_outcome_unknown", method !== "GET");
    }
    if (!response.ok) {
      if (method === "DELETE" && response.status === 404) return null;
      const cooldown = response.status === 429 ? Math.min(86400000, Math.max(60000, Number(response.headers.get("retry-after")) * 1000 || 60000)) : 0;
      throw new GarminTrainingError(response.status === 429 ? "garmin_rate_limited" : "garmin_rejected", method !== "GET" && (response.status >= 500 || response.status === 408), cooldown);
    }
    if (response.status === 204 || method === "DELETE") return null;
    try {
      const reader = response.body?.getReader(), chunks: Uint8Array[] = []; let bytes = 0;
      try { if (reader) while (true) { const {done,value} = await reader.read(); if (done) break; bytes += value.byteLength; if (bytes > 262144) { await reader.cancel(); throw new Error(); } chunks.push(value); } }
      finally { reader?.releaseLock(); }
      return JSON.parse(Buffer.concat(chunks).toString("utf8"));
    } catch { throw new GarminTrainingError("garmin_response_unknown", method !== "GET"); }
  }
  function checkId(value: number) { if (!id(value)) throw new GarminError("invalid_remote_id", "Garmin identifier is invalid."); return value; }
  return {
    create: async (token: string, payload: GarminWorkoutPayload) => parseGarminWorkout(await request(token, "/workoutportal/workout/v2", "POST", payload)),
    read: async (token: string, workoutId: number) => parseGarminWorkout(await request(token, `/training-api/workout/v2/${checkId(workoutId)}`)),
    remove: (token: string, workoutId: number) => request(token, `/training-api/workout/v2/${checkId(workoutId)}`, "DELETE"),
    schedule: async (token: string, workoutId: number, date: string) => {
      if (!/^\d{4}-\d\d-\d\d$/.test(date)) throw new GarminError("invalid_date", "Garmin schedule date is invalid.");
      // The documented schedule POST may return 204. Reconcile by date instead of creating twice.
      const value = await request(token, "/training-api/schedule/", "POST", {workoutId:checkId(workoutId),date});
      return value == null ? null : parseGarminSchedule(value);
    },
    schedules: async (token: string, date: string) => {
      if (!/^\d{4}-\d\d-\d\d$/.test(date)) throw new GarminError("invalid_date", "Garmin schedule date is invalid.");
      const value = await request(token, `/training-api/schedule?startDate=${date}&endDate=${date}`);
      if (!Array.isArray(value) || value.length > 200) throw new GarminTrainingError("invalid_schedule_list", false);
      return value.map(parseGarminSchedule);
    },
    unschedule: (token: string, scheduleId: number) => request(token, `/training-api/schedule/${checkId(scheduleId)}`, "DELETE"),
  };
}
export type GarminTrainingProtocol = ReturnType<typeof createGarminTrainingProtocol>;
