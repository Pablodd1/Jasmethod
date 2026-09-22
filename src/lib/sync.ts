import { prisma } from "./db";
import { encryptSecret, decryptSecret } from "./crypto";
import { dayBounds, dateKey, localDate } from "./dates";
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
          await prisma.dailyMetrics.upsert({
            where: { userId_date: { userId, date } },
            create: { userId, date, ...data },
            update: data,
          });
          // PROVENANCE: every device value also lands as an immutable
          // MetricObservation (review finding D) — the derived daily row can
          // be rebuilt or audited from raw observations per source.
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
          if (obs.length)
            await prisma.metricObservation.createMany({ data: obs, skipDuplicates: false });
          imported++;
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
  return { results, total: results.reduce((sum, r) => sum + r.imported, 0) };
}
