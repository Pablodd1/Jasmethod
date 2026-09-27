import { prisma } from "./db";
import { encryptSecret, decryptSecret } from "./crypto";
import { addDaysKey, dayBounds, dateKey, localDate } from "./dates";
import { storeActivity } from "./activity-store";
import * as api from "./importers";
import { buildFuelingPlan } from "./fueling";
import { sportIcon, calendarDescription, shapeLink, type PlanFormatSession } from "./plan-formats";

// Prescription JSON → exportable steps (defensive: never throw on old data).
function safeSteps(prescription: string | null): PlanFormatSession["steps"] {
  if (!prescription) return [];
  try {
    const p = JSON.parse(prescription);
    return Array.isArray(p.steps)
      ? p.steps.map((s: any) => ({
          name: String(s.name || "Step"),
          seconds: Number(s.seconds) || 0,
          reps: s.reps,
          zone: String(s.zone || "z2"),
          note: s.note,
        }))
      : [];
  } catch {
    return [];
  }
}
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
    select: { timezone: true, profile: { select: { weightKg: true, sweatRateMlH: true, sodiumMgPerL: true, gutTrained: true } } },
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
    const lease = await prisma.connector.updateMany({
      where: {
        id: conn.id,
        OR: [
          { syncStartedAt: null },
          { syncStartedAt: { lt: new Date(Date.now() - 10 * 60000) } },
        ],
      },
      data: { syncStartedAt: new Date() },
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
    try {
      let access = decryptSecret(conn.tokenEnc);
      if (conn.expiresAt && conn.expiresAt <= new Date()) {
        if (!conn.refreshEnc)
          throw new Error("Authorization expired. Reconnect this provider.");
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
        await prisma.connector.update({
          where: { id: conn.id },
          data: {
            tokenEnc: encryptSecret(access),
            ...(token.refresh_token
              ? { refreshEnc: encryptSecret(token.refresh_token) }
              : {}),
            expiresAt: new Date(
              token.expires_at
                ? token.expires_at * 1000
                : Date.now() + token.expires_in * 1000,
            ),
          },
        });
      }
      const since = conn.lastSyncAt
        ? new Date(conn.lastSyncAt.getTime() - 86400000)
        : new Date(Date.now() - 30 * 86400000);
      let imported = 0;
      if (conn.provider === "strava") {
        const activities = await api.stravaGetActivities(access, since, 100);
        for (const a of activities)
          if (
            await storeActivity(userId, user.timezone, {
              ...api.stravaActivityToWorkout(a),
              source: "strava",
            })
          )
            imported++;
      } else if (conn.provider === "google_cal") {
        const start = dayBounds(user.timezone).start,
          end = new Date(start.getTime() + 14 * 86400000);
        const events = await api.googleCalGetEvents(access, 14, start);
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
        const planned = await prisma.workout.findMany({
          where: { userId, planned: true, date: { gte: start, lt: end } },
          include: { planDay: { select: { dayOff: true } } },
        });
        const links = await prisma.calendarEvent.findMany({
          where: {
            userId,
            type: "workout",
            notes: { startsWith: "gcalPush:" },
          },
        });
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
          const fuelPlan = buildFuelingPlan({
            durationMin: w.durationMin,
            intensity: w.intensity || "z2",
            weightKg: profile?.weightKg,
            sweatRateMlH: profile?.sweatRateMlH,
            sodiumMgPerL: profile?.sodiumMgPerL,
            gutTrained: profile?.gutTrained,
          });
          const gid = await api.googleCalUpsertEvent(access, {
            summary: `${sportIcon(w.sport)} ${w.title} · ${w.durationMin} min`,
            description: `${calendarDescription({
              title: w.title,
              sport: w.sport,
              durationMin: w.durationMin,
              intensity: w.intensity,
              steps: safeSteps(w.prescription),
              fuel: fuelPlan,
            })}\n📈 Effort shape: ${shapeLink(w.id)}`,
            start: localDate(
              dateKey(w.date, user.timezone),
              user.timezone,
              w.startTime || "07:00",
            ),
            durationMin: w.durationMin,
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
        for (const l of links.filter((l) => l.workoutId)) {
          const w = await prisma.workout.findFirst({
            where: { id: l.workoutId!, userId },
            include: { planDay: { select: { dayOff: true } } },
          });
          if (
            !w ||
            w.durationMin === 0 ||
            w.planDay?.dayOff ||
            w.feedbackStatus === "skipped"
          ) {
            await api.googleCalDeleteEvent(access, l.notes!.slice(9));
            await prisma.calendarEvent.delete({ where: { id: l.id } });
          }
        }
      } else {
        const days = Math.min(
          90,
          Math.max(1, Math.ceil((Date.now() - since.getTime()) / 86400000)),
        );
        const daily: any[] =
          conn.provider === "oura"
            ? await api.ouraGetDaily(access, days)
            : await api.whoopGetDaily(access, days, user.timezone);
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
          const obs: {
            userId: string; observedAt: Date; metricType: string;
            value: number; unit: string; source: string;
            measurementMethod: string;
          }[] = [];
          const push = (type: string, v: number | null | undefined, unit: string) => {
            if (v != null && Number.isFinite(v))
              obs.push({ userId, observedAt: date, metricType: type, value: v, unit, source: conn.provider, measurementMethod: "device_sync" });
          };
          push("hrv_rmssd", values.hrv, "ms");
          push("resting_hr", values.restingHr, "bpm");
          push("sleep_hours", values.sleepHours, "h");
          push("sleep_score", values.sleepScore, "score");
          push("recovery_score", values.recoveryScore, "score");
          await prisma.$transaction(async tx => {
            await persistDeviceDay(tx, userId, date, conn.provider, data, obs);
          });
          imported++;
        }
        // WHOOP completed workouts — the activity half of WHOOP ingestion
        // (review finding: only daily metrics were imported). Each workout
        // becomes a completed activity row keyed whoop:<id>, so the daily
        // prescription can reference real training that Whoop recorded.
        if (conn.provider === "whoop") {
          try {
            const whoopWorkouts = await api.whoopGetWorkouts(access, Math.min(days, 30));
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

      await prisma.connector.update({
        where: { id: conn.id },
        data: {
          lastSyncAt: new Date(),
          lastSyncCount: imported,
          status: "connected",
          lastError: null,
          syncStartedAt: null,
        },
      });
      // Usage metering: rows synced per user (feeds the admin cost panel).
      if (imported > 0) {
        const { meterUsage } = await import("./telemetry");
        await meterUsage(userId, "db_rows_synced", imported);
      }
      results.push({ provider: conn.provider, ok: true, imported });
    } catch (e: any) {
      const error = String(e?.message || "Provider sync failed")
        .replace(/Bearer\s+\S+/gi, "[redacted]")
        .slice(0, 250);
      await prisma.connector.update({
        where: { id: conn.id },
        data: { status: "error", lastError: error, syncStartedAt: null },
      });
      results.push({ provider: conn.provider, ok: false, imported: 0, error });
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
export async function persistDeviceDay(tx: any, userId: string, date: Date, provider: string, data: any, observations: any[]) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${userId}))`;
  await tx.metricObservation.deleteMany({ where: {
    userId, observedAt: date, source: provider, measurementMethod: "device_sync",
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
