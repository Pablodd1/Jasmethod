import { manualEmailLanguage } from "./manual-workout-email-locale";
import { prisma } from "./db";
import { SessionResolutionError } from "./canonical-session";
import { workoutRevision } from "./workout-update";
import { dayBounds, dateKey } from "./dates";
import { effectivePrescription } from "./effective-prescription";
import { buildSessionDownload } from "./fit-export";
import { manualWorkoutEmail } from "./manual-workout-email-template";
import { manualWorkoutEmailContent } from "./manual-workout-email-content";
import { eligibleManualEmail, manualEmailActionable, manualEmailChanged, manualEmailConfigured, manualEmailDue, manualEmailKey, manualEmailOrigin } from "./manual-workout-email";
import { sendManualEmail } from "./manual-workout-email-transport";

async function snapshot(userId: string, sessionId: string) {
  const workout = await prisma.workout.findFirst({ where: { id: sessionId, userId } });
  if (!workout || !workout.planned || workout.feedbackStatus === "skipped") return { kind: "cancelled" as const, revision: "cancelled", resolved: null, workout };
  if (workout.completed || workout.feedbackStatus) return null;
  let resolved: Awaited<ReturnType<typeof effectivePrescription>>;
  try { resolved = await effectivePrescription(userId, sessionId); }
  catch (error) {
    if (!(error instanceof SessionResolutionError)) throw error;
    return { kind: "held" as const, revision: `invalid:${workoutRevision(workout)}`, resolved: null, workout };
  }
  if (!resolved) return null;
  const audit = await prisma.auditLog.findFirst({ where: { subjectId: userId, entityId: sessionId, action: "workout.approved" }, orderBy: { createdAt: "desc" } });
  let confirmed: string | null = null;
  try { confirmed = audit?.after ? JSON.parse(audit.after).revision : null; } catch { /* malformed historical evidence never confirms */ }
  // Manual Garmin MVP supports single FIT files only, not ZIP multisport bundles.
  const ready = manualEmailActionable(resolved.canonical, workout, confirmed) && resolved.canonical.capability.downloadFormat !== "zip";
  return { kind: ready ? "ready" as const : "held" as const, revision: resolved.canonical.revision, resolved, workout };
}

/** Reconciliation sees effective revisions (including safety/check-in changes),
 * not just explicit workout edits. It never bypasses athlete approval. */
export async function reconcileManualWorkoutEmails(now = new Date(), onlyUserId?: string, dependencies = { resolve: snapshot, send: sendManualEmail, clock: () => new Date() }) {
  if (!manualEmailConfigured()) return { enabled: false, queued: 0, accepted: 0 };
  const origin = manualEmailOrigin();
  await prisma.manualWorkoutEmailOutbox.updateMany({ where: { status: "sending", attemptedAt: { lt: new Date(now.getTime() - 5 * 60_000) } }, data: { status: "unknown", error: "Interrupted attempt; no automatic resend." } });
  const preferences = await prisma.manualWorkoutEmailPreference.findMany({ where: { enabled: true, ...(onlyUserId ? { userId: onlyUserId } : {}) }, include: { user: { select: { id: true, email: true, timezone: true, language: true } } }, take: 500 });
  let queued = 0, accepted = 0, unsupportedLanguage = 0;
  for (const pref of preferences) {
    const language = manualEmailLanguage(pref.user.language);
    if (!language) { unsupportedLanguage++; continue; }
    if (!eligibleManualEmail(pref, pref.user.email) || pref.timezone !== pref.user.timezone) continue;
    const bounds = dayBounds(pref.timezone, now);
    const [workouts, prior] = await Promise.all([
      prisma.workout.findMany({ where: { userId: pref.userId, date: { gte: bounds.start, lt: bounds.end }, planned: true }, select: { id: true }, take: 100 }),
      prisma.manualWorkoutEmailOutbox.findMany({ where: { userId: pref.userId, createdAt: { gte: new Date(now.getTime() - 2 * 86400000) }, status: { in: ["accepted", "unknown", "sending"] } }, orderBy: { createdAt: "desc" }, take: 200 }),
    ]);
    for (const sessionId of new Set([...workouts.map(w => w.id), ...prior.map(p => p.sessionId)])) {
      const resolveState = async () => {
        const value = await dependencies.resolve(pref.userId, sessionId);
        if (value?.resolved && value.resolved.canonical.dateLocal !== bounds.key) value.kind = "held";
        return value;
      };
      const previous = prior.find(p => p.sessionId === sessionId);
      const state = await resolveState();
      if (!state) continue;
      if (state.kind === "cancelled" && !previous) continue;
      const sessionDate = state.resolved?.canonical.dateLocal || (state.workout?.date ? dateKey(state.workout.date, pref.timezone) : bounds.key);
      if (sessionDate !== bounds.key) {
        // A moved or future session invalidates a previously sent file, but does not export tomorrow's plan.
        if (!previous || !pref.revisions) continue;
        state.kind = "held";
      }
      const changed = manualEmailChanged(previous, state);
      if (previous && !changed) continue;
      if (changed ? !pref.revisions : !pref.daily) continue;
      if (!changed && !manualEmailDue({ dateLocal: sessionDate, timezone: pref.timezone, startTime: state.workout?.startTime || null, minuteOfDay: pref.minuteOfDay, leadMinutes: pref.leadMinutes }, now)) continue;
      // New actionable files are never sent after the scheduled start.
      if (state.kind === "ready" && state.workout?.startTime && !manualEmailDue({ dateLocal: bounds.key, timezone: pref.timezone, startTime: state.workout.startTime, minuteOfDay: changed ? 0 : pref.minuteOfDay, leadMinutes: pref.leadMinutes }, now)) continue;
      const kind = state.kind === "ready" && previous ? "revised" : state.kind;
      const dedupeKey = manualEmailKey(pref.userId, sessionId, state.revision, `${kind}:${previous?.id || "initial"}:${language}`);
      let row = await prisma.manualWorkoutEmailOutbox.upsert({ where: { dedupeKey }, update: {}, create: { userId: pref.userId, sessionId, revision: state.revision, kind, dedupeKey, recipient: pref.recipient! } });
      // These states are only written before the SMTP boundary, so requeue is safe
      // after consent/source becomes eligible again. Never requeue sent/ambiguous rows.
      if (["superseded", "cancelled"].includes(row.status)) {
        const restored = await prisma.manualWorkoutEmailOutbox.updateMany({ where: { id: row.id, status: { in: ["superseded", "cancelled"] } }, data: { status: "queued", attemptedAt: null, error: null } });
        if (restored.count) row = { ...row, status: "queued" };
      }
      if (row.status !== "queued") continue;
      queued++;
      await prisma.manualWorkoutEmailOutbox.updateMany({ where: { userId: pref.userId, sessionId, status: "queued", id: { not: row.id } }, data: { status: "superseded" } });
      const dispatchKey = manualEmailKey(pref.userId, sessionId, "dispatch", "lock");
      await prisma.manualWorkoutEmailDispatch.upsert({ where: { key: dispatchKey }, create: { key: dispatchKey, leasedUntil: new Date(0) }, update: {} });
      const locked = await prisma.manualWorkoutEmailDispatch.updateMany({ where: { key: dispatchKey, leasedUntil: { lt: new Date() } }, data: { outboxId: row.id, leasedUntil: new Date(Date.now() + 5 * 60_000) } });
      if (!locked.count) continue;
      const claimed = await prisma.manualWorkoutEmailOutbox.updateMany({ where: { id: row.id, status: "queued" }, data: { status: "sending", attemptedAt: new Date() } });
      if (!claimed.count) {
        await prisma.manualWorkoutEmailDispatch.updateMany({ where: { key: dispatchKey, outboxId: row.id }, data: { outboxId: null, leasedUntil: new Date(0) } });
        continue;
      }
      try {
        // Re-read authorization and effective workout immediately before building/sending.
        const [freshPref, freshUser, fresh] = await Promise.all([
          prisma.manualWorkoutEmailPreference.findUnique({ where: { userId: pref.userId } }),
          prisma.user.findUnique({ where: { id: pref.userId }, select: { email: true, timezone: true, language: true } }),
          resolveState(),
        ]);
        const purposeAllowed = changed ? freshPref?.revisions : freshPref?.daily;
        if (!freshPref || !freshUser || freshUser.language !== language || !eligibleManualEmail(freshPref, freshUser.email) || freshPref.recipient !== row.recipient || freshPref.timezone !== freshUser.timezone || !purposeAllowed || !fresh || fresh.revision !== row.revision || fresh.kind !== (kind === "revised" ? "ready" : kind)) {
          await prisma.manualWorkoutEmailOutbox.update({ where: { id: row.id }, data: { status: "superseded" } });
          continue;
        }
        const actionable = (kind === "ready" || kind === "revised") && fresh.resolved;
        const content = actionable ? manualWorkoutEmailContent(actionable.canonical, actionable.nutrition, fresh.workout?.startTime || null, true, language) : null;
        const email = manualWorkoutEmail({ language, kind, dateLabel: fresh.resolved?.canonical.dateLocal || bounds.key, revision: row.revision.slice(0, 8), workoutUrl: `${origin}/daily?sessionId=${encodeURIComponent(sessionId)}`, settingsUrl: `${origin}/workout-email/settings`, ...(content ? { readyPlan: content.plan } : {}) });
        const download = actionable ? buildSessionDownload(actionable.canonical) : null;
        const attachments = download ? [{ filename: download.filename, content: Buffer.from(download.bytes) }, ...(content?.graphic ? [{ filename: "workout-profile.png", content: content.graphic, cid: "workout-profile@jmm" }] : [])] : [];
        // Last-moment source/consent/time check after potentially expensive FIT/PNG work.
        const [lastPref, lastUser, last] = await Promise.all([
          prisma.manualWorkoutEmailPreference.findUnique({ where: { userId: pref.userId } }),
          prisma.user.findUnique({ where: { id: pref.userId }, select: { email: true, timezone: true, language: true } }),
          resolveState(),
        ]);
        const sendNow = dependencies.clock();
        const due = !actionable || (last?.resolved && manualEmailDue({ dateLocal: last.resolved.canonical.dateLocal, timezone: lastUser?.timezone || pref.timezone, startTime: last.workout?.startTime || null, minuteOfDay: changed ? 0 : lastPref?.minuteOfDay ?? pref.minuteOfDay, leadMinutes: lastPref?.leadMinutes ?? pref.leadMinutes }, sendNow));
        if (!lastPref || !lastUser || lastUser.language !== language || !eligibleManualEmail(lastPref, lastUser.email) || lastPref.recipient !== row.recipient || lastPref.timezone !== lastUser.timezone || !(changed ? lastPref.revisions : lastPref.daily) || !last || last.revision !== row.revision || last.kind !== (kind === "revised" ? "ready" : kind) || !due) {
          await prisma.manualWorkoutEmailOutbox.update({ where: { id: row.id }, data: { status: "superseded" } });
          continue;
        }
        const leaseNow = new Date();
        const stillOwner = await prisma.manualWorkoutEmailDispatch.updateMany({ where: { key: dispatchKey, outboxId: row.id, leasedUntil: { gt: leaseNow } }, data: { leasedUntil: new Date(leaseNow.getTime() + 5 * 60_000) } });
        if (!stillOwner.count) {
          await prisma.manualWorkoutEmailOutbox.update({ where: { id: row.id }, data: { status: "superseded" } });
          continue;
        }
        const receipt = await dependencies.send({ to: row.recipient, ...email, attachments });
        await prisma.manualWorkoutEmailOutbox.update({ where: { id: row.id }, data: { status: receipt.status, receiptId: receipt.receiptId || null, acceptedAt: receipt.status === "accepted" ? new Date() : null } });
        if (receipt.status === "accepted") accepted++;
      } catch {
        // Includes accepted SMTP followed by a failed database write. Never requeue.
        await prisma.manualWorkoutEmailOutbox.updateMany({ where: { id: row.id, status: "sending" }, data: { status: "unknown", error: "Outcome requires review. No automatic retry." } }).catch(() => {});
      } finally {
        await prisma.manualWorkoutEmailDispatch.updateMany({ where: { key: dispatchKey, outboxId: row.id }, data: { outboxId: null, leasedUntil: new Date(0) } }).catch(() => {});
      }
    }
  }
  return { enabled: true, queued, accepted, unsupportedLanguage };
}
