import type { Prisma } from "@prisma/client";
import { formatInTimeZone } from "date-fns-tz";
import { ApiError } from "./access";
import { dateKey } from "./dates";
import { prisma } from "./db";
import { getRaceScenarioWeather, type RaceWeatherResult } from "./race-weather";
import { assessDailyEnvironment, dailyForecastSnapshot, DAILY_ENVIRONMENT_VERSION, parseDailyEnvironmentInput, plannedEnvironmentInstant, type DailyEnvironmentInput, type DailyEnvironmentRecord } from "./daily-environment";

export const DAILY_ENVIRONMENT_ACTION = "workout.environment";
type Reader = Pick<typeof prisma, "auditLog">;
export async function readDailyEnvironment(athleteId: string, sessionId: string, db: Reader = prisma) {
  const entry = await db.auditLog.findFirst({ where: { subjectId: athleteId, entityId: sessionId, action: DAILY_ENVIRONMENT_ACTION }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], select: { id: true, after: true } });
  return { record: entry?.after ?? null, revision: entry?.id ?? null };
}
export interface DailyEnvironmentCommand { sessionId: string; expectedRevision: string | null; environment: DailyEnvironmentInput }
export function parseDailyEnvironmentCommand(raw: Record<string, unknown>): DailyEnvironmentCommand {
  if (Object.keys(raw).some(k => !["sessionId", "expectedRevision", "environment"].includes(k))) throw new ApiError("Unsupported environment request field.");
  if (typeof raw.sessionId !== "string" || !/^[a-zA-Z0-9_-]{1,128}$/.test(raw.sessionId)) throw new ApiError("A valid sessionId is required.");
  if (raw.expectedRevision !== null && (typeof raw.expectedRevision !== "string" || !/^[a-zA-Z0-9_-]{1,128}$/.test(raw.expectedRevision))) throw new ApiError("Reload the venue before saving.", 409);
  try { return { sessionId: raw.sessionId, expectedRevision: raw.expectedRevision as string | null, environment: parseDailyEnvironmentInput(raw.environment) }; }
  catch (error) { throw new ApiError(error instanceof Error ? error.message : "Invalid environment details."); }
}
type Scope = { athleteId: string; actorId: string; timezone: string };
type Schedule = { id: string; date: Date; startTime: string | null; planned: boolean; completed: boolean; feedbackStatus: string | null; feedbackAt: Date | null; actualDurationMin: number | null };
export function environmentScheduleCheck(workout: Schedule | null, scope: Scope, now: Date) {
  if (!workout) throw new ApiError("Session not found", 404);
  if (!workout.planned || workout.completed || workout.feedbackStatus || workout.feedbackAt || workout.actualDurationMin !== null) throw new ApiError("Venue planning is only available for a session without recorded execution.", 409);
  if (dateKey(workout.date, scope.timezone) !== dateKey(now, scope.timezone)) throw new ApiError("Confirm the actual workout venue on its local training day.", 409);
  return workout;
}
const scheduleFields = { id: true, date: true, startTime: true, planned: true, completed: true, feedbackStatus: true, feedbackAt: true, actualDurationMin: true } as const;
export async function prepareDailyEnvironment(command: DailyEnvironmentCommand, scope: Scope, db: Pick<typeof prisma, "workout" | "auditLog"> = prisma, options: { now?: Date; forecast?: typeof getRaceScenarioWeather } = {}) {
  const now = options.now ?? new Date();
  const [row, existing] = await Promise.all([
    db.workout.findFirst({ where: { id: command.sessionId, userId: scope.athleteId }, select: scheduleFields }),
    readDailyEnvironment(scope.athleteId, command.sessionId, db),
  ]);
  const workout = environmentScheduleCheck(row, scope, now);
  if (existing.revision !== command.expectedRevision) throw new ApiError("Venue details changed. Reload before saving.", 409);
  const plannedAt = plannedEnvironmentInstant(command.environment);
  if (plannedAt && dateKey(new Date(plannedAt), scope.timezone) !== dateKey(workout.date, scope.timezone)) throw new ApiError("The planned time must belong to this workout's date in your account timezone.");
  let forecast: RaceWeatherResult | null = null;
  // Only this explicit user action transmits confirmed venue coordinates/time.
  if (command.environment.requestForecast) {
    try { forecast = await (options.forecast ?? getRaceScenarioWeather)({ latitude: command.environment.latitude!, longitude: command.environment.longitude!, at: plannedAt!, timeZone: command.environment.timeZone! }, { userAgent: process.env.RACE_WEATHER_USER_AGENT ?? "JasMiamiMethod/1.0 (+https://github.com/Pablodd1/Jasmethod)" }); }
    catch { forecast = { kind: "unavailable", status: "provider_unavailable", requestedAt: plannedAt!, timeZone: command.environment.timeZone!, fetchedAt: null, sourceUpdatedAt: null, coverageStart: null, coverageEnd: null, point: null, points: [], attribution: [], warnings: ["Venue forecast could not be retrieved."] }; }
  }
  return { workout, plannedAt, forecast, preparedAt: now };
}
/** Shared athlete lock protects optimistic venue saves; no check-in JSON is rewritten. */
export async function saveDailyEnvironment(tx: Prisma.TransactionClient, command: DailyEnvironmentCommand, scope: Scope, prepared: Awaited<ReturnType<typeof prepareDailyEnvironment>>, now = new Date()) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${scope.athleteId}))`;
  const [row, existing] = await Promise.all([
    tx.workout.findFirst({ where: { id: command.sessionId, userId: scope.athleteId }, select: scheduleFields }),
    readDailyEnvironment(scope.athleteId, command.sessionId, tx),
  ]);
  const workout = environmentScheduleCheck(row, scope, now);
  if (existing.revision !== command.expectedRevision || workout.startTime !== prepared.workout.startTime || workout.date.getTime() !== prepared.workout.date.getTime()) throw new ApiError("Workout or venue changed while fetching conditions. Reload before saving.", 409);
  const scheduleTime = prepared.plannedAt ? formatInTimeZone(new Date(prepared.plannedAt), scope.timezone, "HH:mm") : workout.startTime;
  const record: DailyEnvironmentRecord = { ...command.environment, version: DAILY_ENVIRONMENT_VERSION, athleteId: scope.athleteId, sessionId: workout.id, observedOn: dateKey(workout.date, scope.timezone), scheduleTime, scheduleTimezone: scope.timezone,
    source: scope.actorId === scope.athleteId ? "athlete_reported" : "coach_set", confirmedAt: now.toISOString(), plannedAt: prepared.plannedAt, forecast: dailyForecastSnapshot(prepared.forecast) };
  // A saved context changes the revision and requires fresh delivery approval. No
  // intensity, duration, injury flag or symptom/check-in safety state is changed.
  const updated = await tx.workout.updateMany({ where: { id: workout.id, userId: scope.athleteId, planned: true, completed: false, startTime: workout.startTime, date: workout.date, feedbackStatus: null, feedbackAt: null, actualDurationMin: null }, data: { startTime: scheduleTime, indoor: record.setting === "indoor", approved: false } });
  if (updated.count !== 1) throw new ApiError("Workout changed while saving the venue. Reload before saving.", 409);
  const entry = await tx.auditLog.create({ data: { actorId: scope.actorId, subjectId: scope.athleteId, entityId: workout.id, action: DAILY_ENVIRONMENT_ACTION, before: existing.record, after: JSON.stringify(record), note: "Confirmed session-day venue context; forecast is an estimate, never a safety clearance." }, select: { id: true, after: true } });
  if (entry.after !== JSON.stringify(record)) throw new ApiError("Saved venue could not be verified.", 409);
  return assessDailyEnvironment({ record: entry.after, revision: entry.id, athleteId: scope.athleteId, sessionId: workout.id, dateLocal: record.observedOn, timezone: scope.timezone, startTime: scheduleTime, now });
}
