import { randomUUID } from "node:crypto";
import { GarminError, GarminBudgetError } from "./garmin-config";
import { garminWorkoutPayload, type GarminWorkoutPayload } from "./garmin-workout";
import { GarminTrainingError, type GarminTrainingProtocol, type GarminRemoteWorkout } from "./garmin-training-protocol";
import type { CanonicalSession } from "./canonical-session";

export type GarminDeliveryReceipt = { version: 1; athleteId: string; sessionId: string; revision: string; date: string; providerUserId: string;
  status: "working" | "published" | "cancelled" | "unknown" | "failed"; lease: string; leaseUntil: number;
  workoutId?: number; scheduleId?: number; retryAt?: number; stage: string; deviceReceived: false };
export interface GarminDeliveryStore {
  claim(seed: GarminDeliveryReceipt): Promise<GarminDeliveryReceipt | null>;
  save(expected: GarminDeliveryReceipt, next: GarminDeliveryReceipt): Promise<void>;
}
export function verifyGarminWorkout(remote: GarminRemoteWorkout, payload: GarminWorkoutPayload) {
  const a = remote as unknown as Record<string, unknown>, b = payload as unknown as Record<string, unknown>;
  function same(expected: unknown, actual: unknown): boolean {
    if (expected == null) return actual == null;
    if (Array.isArray(expected)) return Array.isArray(actual) && expected.length === actual.length && expected.every((v,i) => same(v,actual[i]));
    if (typeof expected === "object") return !!actual && typeof actual === "object" && Object.entries(expected).every(([k,v]) => same(v,(actual as Record<string,unknown>)[k]));
    if (typeof expected === "number" && typeof actual === "number") return Math.abs(expected-actual) < 0.000001;
    return expected === actual;
  }
  // Metadata may be server-generated; executable steps and the sport must round-trip exactly.
  if (!same(b.segments,a.segments) || b.sport !== a.sport || b.workoutName !== a.workoutName)
    throw new GarminTrainingError("garmin_prescription_mismatch", false);
}
export function createGarminDeliveryService(deps: {
  store: GarminDeliveryStore; protocol: GarminTrainingProtocol;
  authorization: (athleteId: string) => Promise<{accessToken:string;userId:string}>;
  current: (athleteId: string, sessionId: string) => Promise<CanonicalSession | null>;
  creationAllowed?: (continuingPublication: boolean) => Promise<boolean>;
  now?: () => number;
}) {
  const now = deps.now ?? Date.now;
  return async function deliver(input: {athleteId:string;sessionId:string;expectedRevision:string;cancel?:boolean}) {
    const current = await deps.current(input.athleteId,input.sessionId);
    if (current && (current.athleteId !== input.athleteId || current.id !== input.sessionId)) throw new GarminError("session_owner_mismatch","Session ownership could not be verified.",403);
    if (!input.cancel && (!current || current.revision !== input.expectedRevision)) throw new GarminError("stale_prescription", "The prescription changed. Refresh before publishing.",409);
    const payload = !input.cancel && current ? garminWorkoutPayload(current) : null;
    const auth = await deps.authorization(input.athleteId);
    let row = await deps.store.claim({version:1,athleteId:input.athleteId,sessionId:input.sessionId,revision:input.expectedRevision,
      date:current?.dateLocal ?? "",providerUserId:auth.userId,status:"working",lease:randomUUID(),leaseUntil:now()+120000,stage:"claimed",deviceReceived:false});
    if (!row) throw new GarminError("delivery_busy", "This Garmin session is being reconciled. Wait before retrying.",409);
    if (row.providerUserId !== auth.userId) throw new GarminError("garmin_account_changed", "Reconnect the original Garmin account to reconcile its published workouts.",409);
    const save = async (patch: Partial<GarminDeliveryReceipt>) => {
      const next = {...row!,...patch}; await deps.store.save(row!,next); row = next;
    };
    const continuingPublication = row.status === "published";
    const hadRemoteWorkout = !!row.workoutId;
    const fresh = async () => {
      const latest = await deps.authorization(input.athleteId);
      if (latest.userId !== row!.providerUserId) throw new GarminError("garmin_account_changed", "The Garmin account changed during delivery.",409);
      return latest.accessToken;
    };
    const withdraw = async () => {
      if (!row!.workoutId) return;
      const token = await fresh();
      const schedules = await deps.protocol.schedules(token,row!.date);
      // Only delete schedules belonging to the provider workout we created. Never delete by date alone.
      for (const schedule of schedules.filter(s => s.workoutId === row!.workoutId)) await deps.protocol.unschedule(await fresh(),schedule.scheduleId);
      await deps.protocol.remove(await fresh(),row!.workoutId);
      await save({status:"cancelled",stage:"withdrawn",scheduleId:undefined,workoutId:undefined});
    };
    try {
      if (row.status === "unknown" && !row.workoutId) throw new GarminError("manual_reconciliation_required", "A Garmin creation has an unknown outcome. Review Garmin before another creation; automatic retry is blocked.",409);
      if (row.status === "published" && row.revision === input.expectedRevision && !input.cancel) { await save({leaseUntil:0}); return row; }
      if (row.workoutId && (input.cancel || row.revision !== input.expectedRevision || row.status !== "published")) await withdraw();
      if (input.cancel) { await save({status:"cancelled",stage:hadRemoteWorkout?"withdrawn":"nothing_pending",leaseUntil:0}); return row; }
      if (deps.creationAllowed && !await deps.creationAllowed(continuingPublication)) throw new GarminError("automatic_publication_stopped","Automatic Garmin publication is stopped.",409);
      const latest = await deps.current(input.athleteId,input.sessionId);
      if (!latest || latest.revision !== input.expectedRevision || latest.verdict !== "ready") throw new GarminError("stale_prescription", "The prescription is no longer ready for publication.",409);
      await save({status:"working",stage:"creating",revision:input.expectedRevision,date:latest.dateLocal,leaseUntil:now()+120000});
      const created = await deps.protocol.create(await fresh(),payload!);
      // Persist the provider ID before any additional request. A later failure must remain recoverable.
      await save({workoutId:created.workoutId,stage:"created"});
      const retrieved=await deps.protocol.read(await fresh(),created.workoutId);
      if(retrieved.workoutId!==created.workoutId || retrieved.ownerId!==created.ownerId)throw new GarminTrainingError("garmin_workout_identity_mismatch",false);
      verifyGarminWorkout(retrieved,payload!);
      const final = await deps.current(input.athleteId,input.sessionId);
      if (!final || final.revision !== input.expectedRevision || final.verdict !== "ready") { await withdraw(); throw new GarminError("stale_prescription", "The prescription changed during delivery; the remote workout was withdrawn.",409); }
      if (deps.creationAllowed && !await deps.creationAllowed(continuingPublication)) { await withdraw(); throw new GarminError("automatic_publication_stopped","Automatic Garmin publication stopped during delivery; the new workout was withdrawn.",409); }
      await save({stage:"scheduling"});
      // Exactly one POST. Even a 204/timeout is reconciled using our already persisted workout ID.
      try { await deps.protocol.schedule(await fresh(),created.workoutId,row.date); }
      catch (error) { if (!(error instanceof GarminTrainingError) || !error.uncertain) throw error; }
      const schedules = (await deps.protocol.schedules(await fresh(),row.date)).filter(s => s.workoutId === created.workoutId && s.date === row!.date);
      if (schedules.length !== 1) throw new GarminTrainingError("garmin_schedule_unconfirmed",true);
      const after = await deps.current(input.athleteId,input.sessionId);
      if (!after || after.revision !== input.expectedRevision || after.verdict !== "ready") { await withdraw(); throw new GarminError("stale_prescription", "The prescription changed during scheduling; it was withdrawn.",409); }
      await save({status:"published",stage:"schedule_verified",scheduleId:schedules[0].scheduleId,leaseUntil:0,retryAt:undefined});
      return row;
    } catch (error) {
      if (row.status === "cancelled") await save({leaseUntil:0});
      const provedUnsent=(error instanceof GarminTrainingError && !error.uncertain) || (error instanceof GarminError && error.code==="local_garmin_budget");
      if (row.status !== "cancelled") await save({status:(row.status === "unknown" && !row.workoutId) || (row.stage === "creating" && !row.workoutId && !provedUnsent) || (error instanceof GarminTrainingError && error.uncertain) ? "unknown" : "failed",leaseUntil:0,
        ...((error instanceof GarminTrainingError || error instanceof GarminBudgetError) && error.retryAfterMs ? {retryAt:now()+error.retryAfterMs} : {})});
      throw error;
    }
  };
}
