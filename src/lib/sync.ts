import { deviceMetricSnapshot } from "./device-metric-snapshot";
import { calendarUnscheduledCopy, manualWorkoutCalendarPlaceholder, manualWorkoutCalendarRevision, retireWorkoutCalendarLink } from "./manual-workout-calendar";
import { manualEmailLanguage } from "./manual-workout-email-locale";
import { eligibleManualEmail, manualEmailConfigured } from "./manual-workout-email";
import { manualWorkoutCalendarDescription } from "./manual-workout-email-content";
import { prisma } from "./db";
import { encryptSecret, decryptSecret } from "./crypto";
import { addDaysKey, dayBounds, dateKey, localDate } from "./dates";
import { storeActivity } from "./activity-store";
import * as api from "./importers";

import { effectivePrescription } from "./effective-prescription";
import { SessionResolutionError } from "./canonical-session";
import { intervalsConnectorEnabled, INTERVALS_DISABLED_MESSAGE, stravaConnectorEnabled, STRAVA_DISABLED_MESSAGE } from "./capabilities";
import { currentOrReportedWorkoutWhere } from "./calendar-workouts";

export interface SyncResult {
  provider: string;
  ok: boolean;
  imported: number;
  error?: string;
}
export interface SyncSummary {
  results: SyncResult[];
  total: number;
  /** Physiology fields the sync applied to AthleteProfile (present when any changed). */
  profileSynced?: Record<string, unknown>;
}
const configs = {
  intervals: { env: "INTERVALS", path: "intervals", refresh: async (..._args: any[]): Promise<any> => { throw new Error("Reconnect Intervals OAuth authorization"); } },
  strava: { env: "STRAVA", path: "strava", refresh: api.stravaRefreshToken },
  google_cal: {
    env: "GOOGLE",
    path: "google-cal",
    refresh: api.googleCalRefreshToken,
  },
  oura: { env: "OURA", path: "oura", refresh: api.ouraRefreshToken },
  whoop: { env: "WHOOP", path: "whoop", refresh: api.whoopRefreshToken },
};
export async function syncUserConnectors(
  userId: string,
  onlyProvider?: string,
): Promise<SyncSummary> {
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: { timezone: true, email: true, language: true, profile: { select: { weightKg: true, sweatRateMlH: true, sodiumMgPerL: true, gutTrained: true } } },
  });
  const profile = user.profile;
  const connections = await prisma.connector.findMany({
    where: {
      userId,
      status: { in: ["connected", "error"] },
      provider: { in: onlyProvider ? [onlyProvider] : Object.keys(configs) },
      tokenEnc: { not: null },
    },
  });
  const results: SyncResult[] = [];
  for (const conn of connections) {
    const cfg = configs[conn.provider as keyof typeof configs];
    if (!cfg) continue;
    if (conn.provider === "strava" && !stravaConnectorEnabled()) {
      if (onlyProvider === "strava") results.push({ provider: "strava", ok: false, imported: 0, error: STRAVA_DISABLED_MESSAGE });
      continue;
    }
    if (conn.provider === "intervals" && !intervalsConnectorEnabled()) {
      if (onlyProvider === "intervals") results.push({ provider: "intervals", ok: false, imported: 0, error: INTERVALS_DISABLED_MESSAGE });
      continue;
    }
    const syncStartedAt = new Date();
    const lease = await prisma.connector.updateMany({
      where: {
        id: conn.id,
        userId,
        provider: conn.provider,
        tokenEnc: conn.tokenEnc,
        refreshEnc: conn.refreshEnc,
        status: { in: ["connected", "error"] },
        OR: [
          { syncStartedAt: null },
          { syncStartedAt: { lt: new Date(Date.now() - 10 * 60000) } },
        ],
      },
      data: { syncStartedAt },
    });
    if (!lease.count) {
      results.push({
        provider: conn.provider,
        ok: false,
        imported: 0,
        error: "A sync is already running. Check again shortly.",
      });
      continue;
    }
    let imported = 0;
    // Disconnect, reconnect and an expired-lease takeover must all win over
    // this worker. After rotation the local snapshot follows only our CAS.
    const identity = () => ({ id: conn.id, userId, provider: conn.provider,
      tokenEnc: conn.tokenEnc, refreshEnc: conn.refreshEnc, syncStartedAt,
      status: { in: ["connected", "error"] } });
    const requireConnection = async () => {
      const current = await prisma.connector.updateMany({ where: identity(), data: { syncStartedAt } });
      if (current.count !== 1) throw new Error("Connection changed during sync. Review the current connection status.");
    };
    try {
      let access = decryptSecret(conn.tokenEnc);
      if (conn.expiresAt && conn.expiresAt <= new Date()) {
        if (!conn.refreshEnc)
          throw new Error("Authorization expired. Reconnect this provider.");
        await requireConnection();
        const token: any = await cfg.refresh(
          {
            clientId: process.env[`${cfg.env}_CLIENT_ID`]!,
            clientSecret: process.env[`${cfg.env}_CLIENT_SECRET`]!,
            redirectUri:
              process.env[`${cfg.env}_REDIRECT_URI`] ||
              `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/api/connectors/${cfg.path}/callback`,
          },
          decryptSecret(conn.refreshEnc),
        );
        access = token.access_token;
        const rotated = {
          tokenEnc: encryptSecret(access),
          ...(token.refresh_token
            ? { refreshEnc: encryptSecret(token.refresh_token) }
            : {}),
          expiresAt: new Date(
            token.expires_at
              ? token.expires_at * 1000
              : Date.now() + token.expires_in * 1000,
          ),
        };
        const refreshed = await prisma.connector.updateMany({
          where: identity(), data: rotated,
        });
        if (refreshed.count !== 1) throw new Error("Connection changed during authorization refresh. Review the current connection status.");
        Object.assign(conn, rotated);
      }
      // INITIAL BACKFILL vs incremental: the first sync after connecting pulls
      // a full year of Strava activities (the endpoint paginates far beyond
      // that) and 180 days of daily biometrics; every later sync only asks for
      // what happened since last time (+1d overlap). This makes the athlete's
      // history real on day one instead of a 30-day sliver.
      const since = conn.lastSyncAt
        ? new Date(conn.lastSyncAt.getTime() - 86400000)
        : new Date(syncStartedAt.getTime() - (conn.provider === "strava" ? 365 : 180) * 86400000);
      let rejectedActivities = 0;
      await requireConnection();
      if (conn.provider === "intervals") {
        const { ingestIntervals } = await import("./intervals-ingest");
        imported = await ingestIntervals(userId, user.timezone, conn);
      } else if (conn.provider === "strava") {
        const activities = await api.stravaGetActivities(access, since, 100);
        await requireConnection();
        for (const a of activities) {
          let activity: api.ImportedWorkout;
          try { activity = api.stravaActivityToWorkout(a); }
          catch (error) {
            if (!(error instanceof api.StravaActivityDataError)) throw error;
            rejectedActivities++;
            continue;
          }
          // Database/transport failures remain failures, never skipped as bad data.
          if (await storeActivity(userId, user.timezone, activity)) imported++;
        }
        const { importStravaProfileWeight } = await import("./profile-import-review");
        await requireConnection();
        await importStravaProfileWeight(userId, conn.id, conn.externalRef, access);
      } else if (conn.provider === "google_cal") {
        const start = dayBounds(user.timezone).start,
          end = new Date(start.getTime() + 14 * 86400000);
        const events = await api.googleCalGetEvents(access, 14, start);
        await requireConnection();
        const live: string[] = [];
        for (const e of events) {
          const externalId = `google_cal:${e.id}`;
          if (
            e.status === "cancelled" ||
            e.transparency === "transparent" ||
            e.extendedProperties?.private?.jmmWorkoutId
          ) {
            await prisma.calendarEvent.deleteMany({
              where: { userId, externalId, type: "appointment" },
            });
            continue;
          }
          const at = e.start?.dateTime || e.start?.date;
          if (!at) continue;
          const date = e.start.dateTime
            ? dayBounds(user.timezone, new Date(at)).start
            : localDate(at, user.timezone);
          const data = {
            title: e.summary || "Busy",
            date,
            startTime:
              e.start.dateTime ||
              localDate(e.start.date, user.timezone).toISOString(),
            endTime:
              e.end?.dateTime ||
              (e.end?.date
                ? localDate(e.end.date, user.timezone).toISOString()
                : null),
            type: "appointment",
            notes: externalId,
          };
          const legacy = await prisma.calendarEvent.findFirst({
            where: { userId, notes: externalId, externalId: null },
          });
          if (legacy)
            await prisma.calendarEvent.update({
              where: { id: legacy.id },
              data: { externalId, ...data },
            });
          else
            await prisma.calendarEvent.upsert({
              where: { userId_externalId: { userId, externalId } },
              create: { userId, externalId, ...data },
              update: data,
            });
          live.push(externalId);
          imported++;
        }
        // Only reconcile this complete, paginated snapshot of imported appointments.
        await prisma.calendarEvent.deleteMany({
          where: {
            userId,
            type: "appointment",
            date: { gte: start, lt: end },
            externalId: { startsWith: "google_cal:", notIn: live },
          },
        });
        const activePlan = await prisma.trainingPlan.findFirst({ where: { userId, status: "active" }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], select: { id: true } });
        const planned = await prisma.workout.findMany({
          where: { AND: [currentOrReportedWorkoutWhere(userId, activePlan?.id ?? null), { planned: true, date: { gte: start, lt: end } }] },
          include: { planDay: { include: { plan: { select: { id: true, status: true, userId: true } } } } },
        });
        const links = await prisma.calendarEvent.findMany({
          where: {
            userId,
            type: "workout",
            notes: { startsWith: "gcalPush:" },
          },
        });
        // Retract stale actionable copies before publishing other sessions.
        for (const l of links.filter((l) => l.workoutId)) {
          const w = await prisma.workout.findFirst({
            where: { id: l.workoutId!, userId },
            include: { planDay: { include: { plan: { select: { id: true, status: true, userId: true } } } } },
          });
          if (retireWorkoutCalendarLink(w, l.date, start, end, { ownerId: userId, activePlanId: activePlan?.id ?? null })) {
            await requireConnection();
            await api.googleCalDeleteEvent(access, l.notes!.slice(9));
            await prisma.calendarEvent.delete({ where: { id: l.id } });
          }
        }
        for (const w of planned.filter(
          (w) =>
            w.durationMin > 0 &&
            !w.planDay?.dayOff &&
            w.feedbackStatus !== "skipped",
        )) {
          const legacyRemote = events.find(
            (e) => e.extendedProperties?.private?.jmmWorkoutId === w.id,
          );
          const link =
            links.find((l) => l.workoutId === w.id) ||
            links.find((l) => l.notes === `gcalPush:${legacyRemote?.id}`);
          // Calendar delivery has the same safety/revision boundary as the
          // screen and file. Future or held plans are scheduling placeholders,
          // with no actionable steps or private safety reasons transmitted.
          let resolved: Awaited<ReturnType<typeof effectivePrescription>> = null;
          try { resolved = await effectivePrescription(userId, w.id); }
          catch (error) { if (!(error instanceof SessionResolutionError)) throw error; }
          const [emailPref, deliveryUser, approval] = await Promise.all([
            manualEmailConfigured() ? prisma.manualWorkoutEmailPreference.findUnique({ where: { userId } }) : Promise.resolve(null),
            prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { email: true, language: true, timezone: true } }),
            prisma.auditLog.findFirst({ where: { subjectId: userId, entityId: w.id, action: "workout.approved" }, orderBy: { createdAt: "desc" } }),
          ]);
          let approvedRevision: string | null = null;
          try { approvedRevision = approval?.after ? JSON.parse(approval.after).revision : null; } catch { /* no approval evidence */ }
          const ready = resolved?.canonical.verdict === "ready" && w.approved && approvedRevision === resolved.canonical.revision;
          const language = manualEmailLanguage(deliveryUser.language);
          const shareGuidance = !!language && !!emailPref?.calendarGuidance && eligibleManualEmail(emailPref, deliveryUser.email) && emailPref.timezone === deliveryUser.timezone;
          const session = ready ? resolved!.canonical : null;
          const workoutDate = dateKey(w.date, user.timezone);
          const appUrl = `${(process.env.NEXT_PUBLIC_APP_URL || "https://jasmiamimethod.fit").replace(/\/$/, "")}/daily?sessionId=${encodeURIComponent(w.id)}&date=${workoutDate}`;
          const placeholder = manualWorkoutCalendarPlaceholder(deliveryUser.language, !!ready, appUrl);
          const description = (ready && shareGuidance
              ? manualWorkoutCalendarDescription(session!, resolved!.nutrition, w.startTime, language!) + `\n${language === "es" ? "Plan actual y gráfico" : "Current plan and workout graphic"}: ${appUrl}\n${language === "es" ? "Revisión" : "Plan revision"}: ${session!.revision}`
              : placeholder.description) + (w.startTime ? "" : `\n${calendarUnscheduledCopy(deliveryUser.language)}`);
          const revision = manualWorkoutCalendarRevision({
            workoutId: w.id, date: workoutDate, startTime: w.startTime,
            durationMin: session?.durationMin ?? w.durationMin,
            canonicalRevision: resolved?.canonical.revision ?? null, ready: !!ready, description,
          });
          await requireConnection();
          const gid = await api.googleCalUpsertEvent(access, {
            summary: placeholder.summary,
            description,
            revision,
            provisional: !ready,
            start: w.startTime ? localDate(workoutDate, user.timezone, w.startTime) : { date: workoutDate },
            durationMin: session?.durationMin ?? w.durationMin,
            workoutId: w.id,
            existingGoogleId: link?.notes?.slice(9) || legacyRemote?.id,
          });
          const data = {
            title: w.title,
            date: w.date,
            type: "workout",
            notes: `gcalPush:${gid}`,
            workoutId: w.id,
          };
          if (link)
            await prisma.calendarEvent.update({ where: { id: link.id }, data });
          else
            await prisma.calendarEvent.upsert({
              where: { userId_workoutId: { userId, workoutId: w.id } },
              create: { userId, ...data },
              update: data,
            });
        }
      } else {
        // WHOOP wellness and workouts cover the same explicit windows. Only
        // advance the shared cursor when every window completes; a failed
        // page retains the cursor so idempotent imports can be retried.
        // Oura must cover the retained cursor too; capping a long gap and then
        // advancing that cursor would silently discard the older observations.
        const days = Math.max(1, Math.ceil((syncStartedAt.getTime() - since.getTime()) / 86400000));
        const windows: Array<{ start: Date; end: Date }> = [];
        if (conn.provider === "whoop") {
          for (let cursor = since.getTime(); cursor < syncStartedAt.getTime();) {
            const end = Math.min(cursor + 30 * 86400000, syncStartedAt.getTime());
            windows.push({ start: new Date(cursor), end: new Date(end) });
            cursor = end;
          }
        } else windows.push({ start: since, end: syncStartedAt });
        for (const window of windows) {
          await requireConnection();
          const daily: any[] =
            conn.provider === "oura"
              ? await api.ouraGetDaily(access, days)
              : await api.whoopGetDaily(access, days, user.timezone, window);
          await requireConnection();
          for (const d of daily) {
            const date = localDate(d.date, user.timezone);
            const values = {
              hrv: d.hrv,
              restingHr: d.restingHr,
              sleepScore: d.sleepScore,
              sleepHours: d.sleepHours,
              recoveryScore: d.readiness ?? d.recoveryScore,
            };
            for (const field of [
              "restingHr",
              "sleepScore",
              "recoveryScore",
            ] as const)
              if (values[field] != null)
                values[field] = Math.round(values[field]);
            const data = {
              ...Object.fromEntries(
                Object.entries(values).filter(([, v]) => v != null),
              ),
              ...(values.hrv != null ? { hrvType: "rmssd" } : {}),
              source: conn.provider,
            };
            // Retain the latest daily snapshot per provider, separately from
            // the legacy summary row used by existing coaching screens.
            const snapshot=deviceMetricSnapshot(userId,date,conn.provider,data);
            if(snapshot.observations.length) await prisma.$transaction(async tx => {
              await persistDeviceDay(tx, userId, date, conn.provider, snapshot.data, snapshot.observations);
            });
            imported++;
          }
          // WHOOP completed workouts — the activity half of WHOOP ingestion
          // (review finding: only daily metrics were imported). Each workout
          // becomes a completed activity row keyed whoop:<id>, so the daily
          // prescription can reference real training that Whoop recorded.
          if (conn.provider === "whoop") {
            try {
              await requireConnection();
              const whoopWorkouts = await api.whoopGetWorkouts(access, days, window);
              await requireConnection();
              for (const wk of whoopWorkouts) {
                const storedW = await storeActivity(userId, user.timezone, {
                  externalId: wk.externalId,
                  sport: wk.sport,
                  date: wk.start,
                  durationMin: wk.durationMin,
                  avgHr: wk.avgHr,
                  maxHr: wk.maxHr,
                  calories: wk.calories,
                  title: wk.title,
                  source: "whoop",
                });
                if (storedW) imported++;
              }
            } catch (wkErr) {
              // Missing workout permission or provider failure must remain visible.
              throw wkErr;
            }
          }
        }
      }

      const activityWarning = rejectedActivities
        ? `Strava activity data needs review: ${rejectedActivities} record(s) have invalid ID, date or duration. Valid records imported; sync window retained for retry. No reconnect required for this data error.`
        : null;
      const saved = await prisma.connector.updateMany({
        where: identity(),
        data: {
          ...(activityWarning ? {} : { lastSyncAt: syncStartedAt }),
          lastSyncCount: imported,
          status: activityWarning ? "error" : "connected",
          lastError: activityWarning,
          syncStartedAt: null,
        },
      });
      if (saved.count !== 1) throw new Error("Connection changed during sync. Review the current connection status.");
      // Usage metering: rows synced per user (feeds the admin cost panel).
      if (imported > 0) {
        const { meterUsage } = await import("./telemetry");
        await meterUsage(userId, "db_rows_synced", imported);
      }
      results.push({ provider: conn.provider, ok: !activityWarning, imported, ...(activityWarning ? {error:activityWarning} : {}) });
    } catch (e: any) {
      const error = String(e?.message || "Provider sync failed")
        .replace(/Bearer\s+\S+/gi, "[redacted]")
        .slice(0, 250);
      await prisma.connector.updateMany({
        where: identity(),
        data: { status: "error", lastError: error, syncStartedAt: null },
      });
      results.push({ provider: conn.provider, ok: false, imported, error });
    }
  }
  // Reference physiology is filled only from quality-gated observations.
  // Explicit profile values are retained until athlete/coach review.
  let profileSynced: Record<string, unknown> | null = null;
  try {
    profileSynced = await syncPhysiologyToProfile(userId);
  } catch (e) {
    console.warn("[sync] physiology→profile failed:", String(e).slice(0, 140));
  }
  return {
    results,
    total: results.reduce((sum, r) => sum + r.imported, 0),
    ...(profileSynced && Object.keys(profileSynced).length
      ? { profileSynced }
      : {}),
  };
}

// Shared snapshot writer; lock serializes device providers for this athlete.
export async function persistDeviceDay(tx: any, userId: string, date: Date, provider: string, data: any, observations: any[], method="device_sync") {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${userId}))`;
  await tx.metricObservation.deleteMany({ where: {
    userId, observedAt: date, source: provider, measurementMethod: method,
  }});
  if (observations.length) await tx.metricObservation.createMany({ data: observations });
  const previous = await tx.dailyMetrics.findUnique({ where: { userId_date: { userId, date } } });
  // Legacy check-ins lack field-level provenance: do not replace their values.
  if (previous?.source === "manual") return;
  const source = previous && previous.source !== provider ? "mixed" : provider;
  const projection: Record<string, unknown> = { ...data, source };
  if (previous?.source === provider) {
    for (const field of ["hrv", "restingHr", "sleepHours", "sleepScore", "recoveryScore"])
      if (!(field in data)) projection[field] = null;
    if (!("hrv" in data)) projection.hrvType = null;
  }
  if (previous) {
    // A concurrent check-in can become manual without taking the device lock.
    await tx.dailyMetrics.updateMany({ where: { userId, date, source: { not: "manual" } }, data: projection });
  } else {
    await tx.dailyMetrics.create({ data: { userId, date, ...projection } });
  }
}

// Seven distinct prior calendar days from one RMSSD source are required.
// Existing references are never silently replaced: the schema does not yet
// record who approved an HRV/RHR reference or its measurement method.
export function physiologyReferencePatch(
  observations: { observedAt: Date; metricType: string; value: number; source: string; measurementMethod: string | null; qualityFlag?: string | null }[],
  profile: { hrvBaseline?: number | null; restingHr?: number | null },
  timezone: string, now = new Date(),
): Record<string, number> {
  const today = dateKey(now, timezone);
  const first = addDaysKey(today, -7);
  const eligible = observations.filter(o =>
    ["oura", "whoop"].includes(o.source) && o.measurementMethod === "device_sync" &&
    (!o.qualityFlag || o.qualityFlag === "ok") &&
    dateKey(o.observedAt, timezone) >= first && dateKey(o.observedAt, timezone) < today &&
    Number.isFinite(o.value));
  const patch: Record<string, number> = {};
  // A source switch is not evidence that two methods/devices are comparable.
  for (const [metric, field, min, max] of [
    ["hrv_rmssd", "hrvBaseline", 1, 300], ["resting_hr", "restingHr", 25, 150],
  ] as const) {
    if (profile[field] != null) continue;
    const rows = eligible.filter(o => o.metricType === metric && o.value >= min && o.value <= max);
    if (new Set(rows.map(o => o.source)).size !== 1) continue;
    const days = new Map(rows.map(o => [dateKey(o.observedAt, timezone), o.value]));
    if (days.size !== 7) continue;
    patch[field] = Math.round(Array.from(days.values()).reduce((a, b) => a + b, 0) / 7);
  }
  return patch;
}

export async function syncPhysiologyToProfile(userId: string): Promise<Record<string, unknown> | null> {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { timezone: true } });
  const now = new Date();
  const start = localDate(addDaysKey(dateKey(now, user.timezone), -7), user.timezone);
  return prisma.$transaction(async tx => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${userId}))`;
    const profile = await tx.athleteProfile.findUnique({ where: { userId },
      select: { hrvBaseline: true, restingHr: true } });
    if (!profile) return null;
    const observations = await tx.metricObservation.findMany({ where: {
      userId, observedAt: { gte: start, lt: dayBounds(user.timezone, now).start },
      source: { in: ["oura", "whoop"] }, measurementMethod: "device_sync",
      metricType: { in: ["hrv_rmssd", "resting_hr"] },
    }, orderBy: { createdAt: "asc" } });
    const patch = physiologyReferencePatch(observations, profile, user.timezone, now);
    if (!Object.keys(patch).length) return null;
    // Conditional per-field writes also preserve a concurrent manual edit,
    // which is not required to acquire the sync advisory lock.
    const applied: Record<string, number> = {};
    for (const [field, value] of Object.entries(patch)) {
      const result = await tx.athleteProfile.updateMany({ where: { userId, [field]: null }, data: { [field]: value } });
      if (result.count) applied[field] = value;
    }
    return Object.keys(applied).length ? applied : null;
  });
}
