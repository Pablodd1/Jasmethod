import { createHash, randomUUID } from "node:crypto";
import { prisma } from "./db";
import { effectivePrescription } from "./effective-prescription";
import { dateKey } from "./dates";
import { buildFitWorkout } from "./fit-export";
import { fitFilename, requireExportable, SessionResolutionError, type CanonicalSession } from "./canonical-session";
import { requireIntervalsConnector } from "./capabilities";
import { getIntervalsAuthorization } from "./intervals-oauth";
import { readIntervalsAutoPublish } from "./intervals-preferences";
import { intervalsUpsertFit, intervalsDeleteOwnedEvent, IntervalsDeliveryError } from "./intervals";

export type IntervalsReceipt = { version: 1; status: "publishing" | "published" | "cancelled" | "unknown" | "rejected"; externalId: string; revision: string; dateLocal?: string; providerAthleteId?: string; eventId?: string; lease?: string; leaseUntil?: number; action?: "publish" | "cancel" };
export function intervalsExternalId(athleteId: string, sessionId: string) { return `jmm-${createHash("sha256").update(`${athleteId}:${sessionId}`).digest("hex")}`; }
export function readIntervalsReceipt(value: string | null | undefined): IntervalsReceipt | null {
  try { const r = JSON.parse(value || "null"); return r?.version === 1 && typeof r.externalId === "string" && typeof r.status === "string" ? r : null; } catch { return null; }
}
export function canonicalIntervalsPayload(session: CanonicalSession) {
  requireExportable(session);
  if (!["run", "bike"].includes(session.sport) || session.capability.mode !== "native") throw new SessionResolutionError("Automatic Intervals publishing currently supports native run and bike workouts only. Use the manual session download for other sports.", 422);
  return { external_id: intervalsExternalId(session.athleteId, session.id), start_date_local: `${session.dateLocal}T00:00:00`, filename: fitFilename(session), file_contents_base64: Buffer.from(buildFitWorkout(session, new Date(`${session.dateLocal}T00:00:00Z`))).toString("base64") };
}
export type DeliveryResult = { status: "published" | "cancelled" | "unknown" | "busy" | "rejected"; deviceReceived: false; structured: boolean; revision?: string; intervalsId?: string; error?: string; verification: "provider_accepted" | "previous_receipt" | "provider_cancelled" | "unconfirmed" };
const result = (status: DeliveryResult["status"], revision: string, error?: string, eventId?: string): DeliveryResult => ({ status, revision, verification: status === "published" ? "provider_accepted" : status === "cancelled" ? "provider_cancelled" : "unconfirmed", deviceReceived: false, structured: status === "published", ...(error ? { error } : {}), ...(eventId ? { intervalsId: eventId } : {}) });

export async function publishIntervalsWorkout(input: { athleteId: string; sessionId: string; expectedRevision: unknown; actorId: string; action?: "publish" | "cancel" }): Promise<DeliveryResult> {
  requireIntervalsConnector();
  const resolved = await effectivePrescription(input.athleteId, input.sessionId);
  if (!resolved) throw new SessionResolutionError("Session not found.", 404);
  const session = resolved.canonical;
  if (typeof input.expectedRevision !== "string" || input.expectedRevision !== session.revision) throw new SessionResolutionError("This session changed. Refresh before publishing or cancelling.", 409);
  const action = input.action ?? "publish";
  const payload = action === "publish" ? canonicalIntervalsPayload(session) : null;
  const { authorization, athleteId: providerAthleteId } = await getIntervalsAuthorization(input.athleteId, ["CALENDAR:WRITE"]);
  const workout = await prisma.workout.findFirst({ where: { id: input.sessionId, userId: input.athleteId }, include: { planDay: { include: { plan: { select: { status: true } } } } } });
  if (!workout) throw new SessionResolutionError("Session not found.", 404);
  const mayPublish = (w: { planned: boolean; completed: boolean; planDay?: { plan?: { status: string } } | null }) => w.planned && !w.completed && (!w.planDay?.plan || w.planDay.plan.status === "active");
  if (action === "publish" && !mayPublish(workout)) throw new SessionResolutionError("Only incomplete planned sessions in an active plan can be published.", 409);
  const prior = readIntervalsReceipt(workout.deliveryId);
  if (prior?.providerAthleteId && prior.providerAthleteId !== providerAthleteId) throw new SessionResolutionError("This delivery belongs to a different Intervals account. Reconnect the original account to maintain or cancel it.", 409);
  if (workout.deliveryProvider && workout.deliveryProvider !== "intervals") throw new SessionResolutionError("Another provider owns this workout delivery.", 409);
  if (workout.deliveryId?.startsWith("pending:")) throw new SessionResolutionError("An older publication has an unknown outcome. Review the original calendar event before replacing this connection.", 409);
  if (prior?.leaseUntil && prior.leaseUntil > Date.now()) return result("busy", session.revision, "Another publication is in progress.");
  if (prior?.status === "published" && prior.revision === session.revision && action === "publish") return { ...result("published", session.revision, undefined, prior.eventId), verification: "previous_receipt" };
  if (prior?.status === "cancelled" && action === "cancel") return result("cancelled", session.revision);
  // Older API-key events are never duplicated by silently starting an OAuth copy.
  const legacyId = workout.deliveryId && !prior && !workout.deliveryId.startsWith("pending:") ? workout.deliveryId : undefined;
  if (legacyId && action === "publish") throw new SessionResolutionError("Cancel the previous calendar event before publishing its structured replacement.", 409);
  const receipt: IntervalsReceipt = { version: 1, status: "publishing", externalId: intervalsExternalId(input.athleteId, input.sessionId), revision: session.revision, dateLocal: session.dateLocal, providerAthleteId, eventId: prior?.eventId, action, lease: randomUUID(), leaseUntil: Date.now() + 120_000 };
  const claimedValue = JSON.stringify(receipt);
  const claimed = await prisma.workout.updateMany({ where: { id: workout.id, userId: input.athleteId, deliveryId: workout.deliveryId }, data: { deliveryProvider: "intervals", deliveryId: claimedValue } });
  if (!claimed.count) return result("busy", session.revision, "Another publication changed this session. Retry after refreshing.");
  let outcome: IntervalsReceipt["status"] = "unknown", eventId = prior?.eventId, reason: string | undefined;
  try {
    // Persist ownership before the external request so deleted sessions can be retracted.
    await prisma.auditLog.create({ data: { actorId: input.actorId, subjectId: input.athleteId, action: "intervals.delivery", entityId: workout.id, after: claimedValue } });
    // Recheck after obtaining the claim; a stale revision never starts a new request.
    const latest = await effectivePrescription(input.athleteId, input.sessionId);
    const latestWorkout = action === "publish" ? await prisma.workout.findFirst({ where: { id: input.sessionId, userId: input.athleteId }, include: { planDay: { include: { plan: { select: { status: true } } } } } }) : null;
    if (action === "publish" && (!latestWorkout || !mayPublish(latestWorkout) || latest?.canonical.revision !== session.revision)) throw new IntervalsDeliveryError("Session changed before publication. Refresh and retry.", true, 409);
    if (action === "cancel") { await intervalsDeleteOwnedEvent(authorization, receipt.externalId, legacyId); outcome = "cancelled"; }
    else {
      eventId = (await intervalsUpsertFit(authorization, payload!)).id;
      const after = await effectivePrescription(input.athleteId, input.sessionId);
      const afterWorkout = await prisma.workout.findFirst({ where: { id: input.sessionId, userId: input.athleteId }, include: { planDay: { include: { plan: { select: { status: true } } } } } });
      if (!after || !afterWorkout || !mayPublish(afterWorkout) || after.canonical.revision !== session.revision) {
        await intervalsDeleteOwnedEvent(authorization, receipt.externalId);
        outcome = "cancelled"; reason = "Session changed while publishing; the superseded event was removed. Refresh before publishing again.";
      } else outcome = "published";
    }
  } catch (error) {
    outcome = error instanceof IntervalsDeliveryError && error.definite ? "rejected" : "unknown";
    reason = outcome === "unknown" ? "Provider outcome is unknown. Reconciliation will retry the same external ID; watch receipt is not confirmed." : (error as Error).message;
  }
  const saved: IntervalsReceipt = { version: 1, externalId: receipt.externalId, revision: session.revision, dateLocal: session.dateLocal, providerAthleteId, eventId, status: outcome, action };
  try {
    const stored = await prisma.workout.updateMany({ where: { id: workout.id, userId: input.athleteId, deliveryId: claimedValue }, data: { deliveryId: JSON.stringify(saved) } });
    if (!stored.count) return result("unknown", session.revision, "Provider responded, but the local receipt could not be confirmed.", eventId);
    await prisma.auditLog.create({ data: { actorId: input.actorId, subjectId: input.athleteId, action: "intervals.delivery", entityId: workout.id, after: JSON.stringify(saved), note: reason } });
  } catch { return result("unknown", session.revision, "Provider responded, but the local receipt could not be confirmed.", eventId); }
  return result(outcome as DeliveryResult["status"], session.revision, reason, eventId);
}

// Bounded automatic maintenance of sessions the athlete has already published.
// New sessions require explicit auto-publish consent and approval of their exact revision.
// This maintains JMM-source revisions only. Remote calendar edits/deletions are not mirrored;
// unchanged sessions return a previous receipt, never a fresh provider verification.
export async function reconcileIntervalsPublications(athleteId: string) {
  requireIntervalsConnector();
  const now = new Date(), end = new Date(now.getTime() + 7 * 86400000);
  const workouts = await prisma.workout.findMany({ where: { userId: athleteId, OR: [{ deliveryProvider: "intervals", deliveryId: { not: null } }, { deliveryId: null, approved: true, planned: true, completed: false, sport: { in: ["run", "bike"] } }], date: { gte: new Date(now.getTime() - 86400000), lte: end } }, include: { planDay: { include: { plan: { select: { status: true } } } } }, take: 50, orderBy: { date: "asc" } });
  const outcomes: DeliveryResult[] = [];
  for (const workout of workouts) {
    const receipt = readIntervalsReceipt(workout.deliveryId);
    if (receipt?.status === "cancelled") continue;
    if (!receipt) {
      if (workout.deliveryId || process.env.ENABLE_INTERVALS_AUTO_PUBLISH !== "true" || !workout.approved) continue;
      const connector = await prisma.connector.findUnique({ where: { userId_provider: { userId: athleteId, provider: "intervals" } }, select: { externalRef: true } });
      if (!connector?.externalRef || !await readIntervalsAutoPublish(athleteId, connector.externalRef)) continue;
    }
    const resolved = await effectivePrescription(athleteId, workout.id);
    if (!resolved) continue;
    if (!receipt && resolved.canonical.dateLocal < dateKey(now, resolved.canonical.timezone)) continue;
    if (!receipt) {
      const approval = await prisma.auditLog.findFirst({ where: { subjectId: athleteId, entityId: workout.id, action: "workout.approved" }, orderBy: { createdAt: "desc" }, select: { after: true } });
      let revision: unknown; try { revision = JSON.parse(approval?.after || "null")?.revision; } catch { revision = null; }
      if (revision !== resolved.canonical.revision) continue;
    }
    const cancel = receipt?.action === "cancel" || (workout.planDay != null && workout.planDay.plan.status !== "active") || resolved.canonical.verdict !== "ready" || workout.completed || !workout.planned || !["run", "bike"].includes(resolved.canonical.sport);
    if (!receipt && cancel) continue;
    const outcome = await publishIntervalsWorkout({ athleteId, sessionId: workout.id, expectedRevision: resolved.canonical.revision, actorId: athleteId, action: cancel ? "cancel" : "publish" });
    outcomes.push(outcome);
  }
  // Plan regeneration may delete local rows. Audit ownership survives that deletion.
  // Use a conservative UTC envelope covering all local dates in the bounded window.
  // Filter by the scheduled date inside our own serialized receipt, not audit age:
  // a future event can have been published months before its scheduled date.
  const firstDate = new Date(now.getTime() - 86400000).toISOString().slice(0, 10);
  const lastDate = new Date(end.getTime() + 86400000).toISOString().slice(0, 10);
  const scheduledDates = Array.from({ length: 10 }, (_, i) => new Date(now.getTime() + (i - 1) * 86400000).toISOString().slice(0, 10));
  const audit = await prisma.auditLog.findMany({ where: { subjectId: athleteId, action: "intervals.delivery", OR: scheduledDates.map(day => ({ after: { contains: `"dateLocal":"${day}"` } })) }, orderBy: { createdAt: "desc" }, take: 100 });
  const seen = new Set<string>();
  for (const entry of audit) {
    if (!entry.entityId || seen.has(entry.entityId)) continue;
    seen.add(entry.entityId);
    const receipt = readIntervalsReceipt(entry.after);
    if (!receipt || receipt.status === "cancelled" || !receipt.dateLocal || receipt.dateLocal < firstDate || receipt.dateLocal > lastDate || (receipt.leaseUntil && receipt.leaseUntil > Date.now())) continue;
    if (await prisma.workout.findFirst({ where: { id: entry.entityId, userId: athleteId }, select: { id: true } })) continue;
    const { authorization, athleteId: providerAthleteId } = await getIntervalsAuthorization(athleteId, ["CALENDAR:WRITE"]);
    if (receipt.providerAthleteId && receipt.providerAthleteId !== providerAthleteId) throw new SessionResolutionError("A deleted session belongs to a different Intervals account; reconnect that account to cancel it.", 409);
    await intervalsDeleteOwnedEvent(authorization, receipt.externalId);
    await prisma.auditLog.create({ data: { actorId: athleteId, subjectId: athleteId, action: "intervals.delivery", entityId: entry.entityId, after: JSON.stringify({ ...receipt, status: "cancelled", lease: undefined, leaseUntil: undefined }), note: "Removed provider event for a deleted local session." } });
  }
  if (outcomes.some(o => ["unknown", "rejected"].includes(o.status))) throw new Error("One or more Intervals publications require reconciliation.");
  return outcomes;
}
