import { parseStoredStreams, type ActivityStreams } from "./activity-streams";
import { type ProvenanceFields, provenanceOf } from "./strava-provenance";

/**
 * Storage policy for second-by-second activity data. This is the most granular health data JMM would hold about
 * an athlete, so it is opt-in at every level and deletable:
 *
 *  1. OFF unless the operator sets ENABLE_ACTIVITY_STREAMS=1 (and applies the additive migration).
 *  2. Stored only when the athlete ticked the consent box on THAT upload (`consent === true`; the timestamp is
 *     kept as `consentAt`). No consent → the summary is imported as before and the second-by-second data is
 *     discarded, never parked.
 *  3. Never stored for Strava-origin or unknown-origin activities (strava-provenance.ts) — storing it would be
 *     building a derived data set from restricted data.
 *  4. Retention: ACTIVITY_STREAM_RETENTION_DAYS (default 180, 1..365). Expired rows are invisible to readers
 *     immediately and removed by `purgeExpired`.
 *  5. The athlete can delete one activity's data or all of it; deleting the workout or the account cascades.
 *  6. No GPS is ever part of the stored shape (activity-streams.ts).
 *
 * The module is storage-agnostic: it talks to a small repository interface so the policy is testable without a
 * database; `prismaStreamRepo` adapts a Prisma delegate to it. Every read and delete is scoped by athlete id.
 */
export const DEFAULT_RETENTION_DAYS = 180;
export const MAX_RETENTION_DAYS = 365;

export interface StreamRow { userId: string; workoutId: string; data: string; sampleCount: number; durationSec: number; consentAt: Date; expiresAt: Date; schemaVersion: number }
export interface StreamRepo {
  upsert(row: StreamRow): Promise<void>;
  find(userId: string, workoutId: string): Promise<StreamRow | null>;
  deleteForWorkout(userId: string, workoutId: string): Promise<number>;
  deleteAllForUser(userId: string): Promise<number>;
  deleteExpired(now: Date): Promise<number>;
  /** Workout ids (for this athlete) that currently have unexpired stored data. */
  listWorkoutIds(userId: string, now: Date): Promise<string[]>;
}
type Env = Record<string, string | undefined>;

export const streamStorageEnabled = (env: Env = process.env) => env.ENABLE_ACTIVITY_STREAMS === "1";
export function retentionDays(env: Env = process.env): number {
  const raw = Number(env.ACTIVITY_STREAM_RETENTION_DAYS);
  return Number.isInteger(raw) && raw >= 1 && raw <= MAX_RETENTION_DAYS ? raw : DEFAULT_RETENTION_DAYS;
}

export type StoreOutcome = "stored" | "disabled" | "no_consent" | "strava_origin" | "unknown_origin" | "no_streams";
export interface StoreInput {
  athleteId: string; workoutId: string; streams: ActivityStreams | null | undefined;
  provenance: ProvenanceFields; consent: boolean; now?: Date; env?: Env;
}
export async function storeStreams(repo: StreamRepo, input: StoreInput): Promise<StoreOutcome> {
  const env = input.env ?? process.env, now = input.now ?? new Date();
  if (!streamStorageEnabled(env)) return "disabled";
  if (input.consent !== true) return "no_consent";
  const origin = provenanceOf(input.provenance);
  if (origin === "strava") return "strava_origin";
  if (origin === "unknown") return "unknown_origin";
  const s = input.streams;
  if (!s || s.t.length < 2) return "no_streams";
  const durationSec = Math.round(s.t[s.t.length - 1] - s.t[0]);
  await repo.upsert({
    userId: input.athleteId, workoutId: input.workoutId, data: JSON.stringify(s), sampleCount: s.t.length, durationSec, schemaVersion: s.version,
    consentAt: now, expiresAt: new Date(now.getTime() + retentionDays(env) * 86_400_000),
  });
  return "stored";
}

/** Unexpired, schema-valid streams of one of THIS athlete's workouts, else null. */
export async function loadStreams(repo: StreamRepo, athleteId: string, workoutId: string, now = new Date()): Promise<ActivityStreams | null> {
  const row = await repo.find(athleteId, workoutId);
  if (!row || row.userId !== athleteId || row.workoutId !== workoutId || row.expiresAt.getTime() <= now.getTime()) return null;
  return parseStoredStreams(row.data);
}
export const deleteStreams = (repo: StreamRepo, athleteId: string, workoutId: string) => repo.deleteForWorkout(athleteId, workoutId);
export const deleteAllStreams = (repo: StreamRepo, athleteId: string) => repo.deleteAllForUser(athleteId);
export const purgeExpired = (repo: StreamRepo, now = new Date()) => repo.deleteExpired(now);

/** Structural slice of the Prisma delegate, so this file never imports the (ungenerated here) client types. */
export interface StreamDelegate {
  upsert(args: { where: { workoutId: string }; create: StreamRow; update: Partial<StreamRow> }): Promise<unknown>;
  findFirst(args: { where: { userId: string; workoutId: string } }): Promise<StreamRow | null>;
  deleteMany(args: { where: Record<string, unknown> }): Promise<{ count: number }>;
  findMany(args: { where: Record<string, unknown>; select: { workoutId: true } }): Promise<{ workoutId: string }[]>;
}
export function prismaStreamRepo(delegate: StreamDelegate): StreamRepo {
  return {
    upsert: async row => { await delegate.upsert({ where: { workoutId: row.workoutId }, create: row, update: { data: row.data, sampleCount: row.sampleCount, durationSec: row.durationSec, consentAt: row.consentAt, expiresAt: row.expiresAt, schemaVersion: row.schemaVersion } }); },
    find: (userId, workoutId) => delegate.findFirst({ where: { userId, workoutId } }),
    deleteForWorkout: async (userId, workoutId) => (await delegate.deleteMany({ where: { userId, workoutId } })).count,
    deleteAllForUser: async userId => (await delegate.deleteMany({ where: { userId } })).count,
    deleteExpired: async now => (await delegate.deleteMany({ where: { expiresAt: { lte: now } } })).count,
    listWorkoutIds: async (userId, now) => (await delegate.findMany({ where: { userId, expiresAt: { gt: now } }, select: { workoutId: true } })).map(r => r.workoutId),
  };
}
