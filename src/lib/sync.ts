// JasMiamiMethod — device sync engine (shared by the athlete's sync button
// and the 5am cron). Extracted from api/connectors/sync so both paths stay
// identical.
//
// Providers: strava, garmin, google_cal, oura, whoop (OAuth, token refresh
// handled inline). COROS/Apple/Garmin-TCX arrive via file import instead.

import { prisma } from "./db";
import { encryptSecret, decryptSecret } from "./crypto";
import { sendEmail } from "./email";
import {
  stravaRefreshToken, stravaGetActivities, stravaActivityToWorkout,
  garminRefreshToken, garminGetActivities, garminActivityToWorkout,
  googleCalRefreshToken, googleCalGetEvents, googleCalUpsertEvent,
  ouraRefreshToken, ouraGetDaily,
  whoopRefreshToken, whoopGetDaily,
} from "./importers";

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

// Admin failure alerts: at most one email per user+provider per 6 hours so a
// broken token can't spam the inbox all day.
const ALERT_THROTTLE_MS = 6 * 3600 * 1000;
const lastAlert = new Map<string, number>();

export async function notifyAdminsSyncFailure(user: { id: string; name: string; email: string }, failures: SyncResult[]): Promise<void> {
  if (!failures.length) return;
  const now = Date.now();
  // Only candidates past the throttle window; the timestamp is committed
  // AFTER the emails actually go out (so a no-admin run doesn't consume it).
  const fresh = failures.filter((f) => {
    const key = `${user.id}:${f.provider}`;
    const last = lastAlert.get(key) || 0;
    return now - last >= ALERT_THROTTLE_MS;
  });
  if (!fresh.length) return;

  const admins = await prisma.user.findMany({ where: { role: { in: ["admin", "coach"] } }, select: { email: true } });
  if (!admins.length) return;
  const lines = fresh.map((f) => `• ${f.provider}: ${f.error || "unknown error"}`).join("<br>");
  const subject = `⚠️ Device sync failed — ${user.name}`;
  const html = `<div style="font-family:system-ui;max-width:600px;margin:auto">
    <h2 style="color:#b91c1c;margin:0 0 8px">⚠️ Device sync failed</h2>
    <p><strong>${user.name}</strong> (${user.email}) — ${new Date().toUTCString()}</p>
    <p>${lines}</p>
    <p style="color:#64748b;font-size:13px">The athlete saw this error too. Likely causes: revoked authorization, expired refresh token, or provider outage. Ask them to disconnect + reconnect the device in Connectors.</p>
  </div>`;
  for (const a of admins) {
    await sendEmail({ to: a.email, subject, html }).catch(() => {});
  }
  for (const f of fresh) lastAlert.set(`${user.id}:${f.provider}`, now);
}

export async function syncUserConnectors(userId: string, onlyProvider?: string): Promise<SyncSummary> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, name: true, email: true } });
  if (!user) return { results: [{ provider: onlyProvider || "all", ok: false, imported: 0, error: "User not found" }], total: 0 };

  const connectors = await prisma.connector.findMany({
    where: { userId, status: "connected", ...(onlyProvider ? { provider: onlyProvider } : {}) },
  });

  const results: SyncResult[] = [];
  let total = 0;
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

  for (const conn of connectors) {
    // Incremental: since the last sync (minus a 1-day overlap), or 30 days back.
    const since = conn.lastSyncAt ? new Date(conn.lastSyncAt.getTime() - 86400000) : new Date(Date.now() - 30 * 86400000);
    try {
      if (conn.provider === "strava") {
        let access = decryptSecret(conn.tokenEnc!);
        if (conn.expiresAt && conn.expiresAt < new Date() && conn.refreshEnc && process.env.STRAVA_CLIENT_ID) {
          const t = await stravaRefreshToken(
            { clientId: process.env.STRAVA_CLIENT_ID!, clientSecret: process.env.STRAVA_CLIENT_SECRET!, redirectUri: `${baseUrl}/api/connectors/strava/callback` },
            decryptSecret(conn.refreshEnc)
          );
          access = t.access_token;
          await prisma.connector.update({ where: { id: conn.id }, data: { tokenEnc: encryptSecret(t.access_token), refreshEnc: encryptSecret(t.refresh_token), expiresAt: new Date(t.expires_at * 1000) } });
        }
        const activities = await stravaGetActivities(access, since, 30);
        let imported = 0;
        for (const a of activities) {
          const w = stravaActivityToWorkout(a);
          const existing = await prisma.workout.findFirst({ where: { userId, externalId: w.externalId } });
          if (existing) continue;
          await prisma.workout.create({ data: { userId, date: w.date, sport: w.sport, title: w.title, type: "endurance", durationMin: w.durationMin, distanceKm: w.distanceKm, avgHr: w.avgHr, maxHr: w.maxHr, avgPower: w.avgPower, calories: w.calories, planned: false, completed: true, source: "strava", externalId: w.externalId } });
          imported++;
        }
        total += imported;
        results.push({ provider: "strava", ok: true, imported });
        await prisma.connector.update({ where: { id: conn.id }, data: { lastSyncAt: new Date(), lastSyncCount: imported } });

      } else if (conn.provider === "garmin") {
        let access = decryptSecret(conn.tokenEnc!);
        if (conn.expiresAt && conn.expiresAt < new Date() && conn.refreshEnc && process.env.GARMIN_CLIENT_ID) {
          const t = await garminRefreshToken(
            { clientId: process.env.GARMIN_CLIENT_ID!, clientSecret: process.env.GARMIN_CLIENT_SECRET!, redirectUri: `${baseUrl}/api/connectors/garmin/callback` },
            decryptSecret(conn.refreshEnc)
          );
          access = t.access_token;
          await prisma.connector.update({ where: { id: conn.id }, data: { tokenEnc: encryptSecret(t.access_token), refreshEnc: encryptSecret(t.refresh_token), expiresAt: new Date(Date.now() + (t.expires_in || 3600) * 1000) } });
        }
        const activities = await garminGetActivities(access, since);
        let imported = 0;
        for (const a of activities) {
          const w = garminActivityToWorkout(a);
          const existing = await prisma.workout.findFirst({ where: { userId, externalId: w.externalId } });
          if (existing) continue;
          await prisma.workout.create({ data: { userId, date: w.date, sport: w.sport, title: w.title, type: "endurance", durationMin: w.durationMin, distanceKm: w.distanceKm, avgHr: w.avgHr, maxHr: w.maxHr, avgPower: w.avgPower, calories: w.calories, planned: false, completed: true, source: "garmin", externalId: w.externalId } });
          imported++;
        }
        total += imported;
        results.push({ provider: "garmin", ok: true, imported });
        await prisma.connector.update({ where: { id: conn.id }, data: { lastSyncAt: new Date(), lastSyncCount: imported } });

      } else if (conn.provider === "google_cal") {
        let access = decryptSecret(conn.tokenEnc!);
        if (conn.expiresAt && conn.expiresAt < new Date() && conn.refreshEnc && process.env.GOOGLE_CLIENT_ID) {
          const t = await googleCalRefreshToken(
            { clientId: process.env.GOOGLE_CLIENT_ID!, clientSecret: process.env.GOOGLE_CLIENT_SECRET!, redirectUri: `${baseUrl}/api/connectors/google-cal/callback` },
            decryptSecret(conn.refreshEnc)
          );
          access = t.access_token;
          await prisma.connector.update({ where: { id: conn.id }, data: { tokenEnc: encryptSecret(t.access_token), refreshEnc: encryptSecret(t.refresh_token), expiresAt: new Date(Date.now() + (t.expires_in || 3600) * 1000) } });
        }
        const events = await googleCalGetEvents(access, 14);
        let imported = 0;
        for (const ev of events) {
          const start = ev.start?.dateTime || ev.start?.date;
          if (!start) continue;
          const title = ev.summary || "Busy";
          const existing = await prisma.calendarEvent.findFirst({ where: { userId, title, date: new Date(start), type: "appointment" } });
          if (existing) continue;
          await prisma.calendarEvent.create({ data: { userId, title, date: new Date(start), startTime: ev.start?.dateTime ? start : null, endTime: ev.end?.dateTime || null, type: "appointment", notes: `google_cal:${ev.id}` } });
          imported++;
        }
        total += imported;
        results.push({ provider: "google_cal", ok: true, imported });

        // ---- PUBLISH: mirror our planned workouts (next 14 days) onto the
        // athlete's Google Calendar so they can plan their schedule around
        // training. Upsert via stored google event id (notes: gcalPush:<id>).
        const soon = new Date(Date.now() + 14 * 86400000);
        const planned = await prisma.workout.findMany({
          where: { userId, planned: true, date: { gte: new Date(), lte: soon } },
          orderBy: { date: "asc" },
        });
        const existingLinks = await prisma.calendarEvent.findMany({
          where: { userId, type: "workout", notes: { startsWith: "gcalPush:" } },
          select: { notes: true, title: true, date: true },
        }).catch(() => []);
        const linkByTitleDate = new Map<string, string>();
        for (const l of existingLinks as any[]) {
          const gid = (l.notes || "").replace("gcalPush:", "");
          if (gid) linkByTitleDate.set(`${l.title}|${new Date(l.date).toISOString().slice(0, 10)}`, gid);
        }
        let published = 0;
        for (const w of planned) {
          const d = new Date(w.date);
          const [sh, sm] = (w.startTime || "07:00").split(":").map(Number);
          d.setHours(sh || 7, sm || 0, 0, 0);
          const summary = `🏋️ ${w.title} · ${w.durationMin}min${w.intensity ? " " + w.intensity.toUpperCase() : ""}`;
          const key = `${summary}|${w.date.toISOString().slice(0, 10)}`;
          const existingGoogleId = linkByTitleDate.get(`${w.title}|${w.date.toISOString().slice(0, 10)}`) || null;
          const gid = await googleCalUpsertEvent(access, {
            summary,
            description: w.notes || undefined,
            start: d,
            durationMin: w.durationMin,
            workoutId: w.id,
            existingGoogleId,
          }).catch(() => null);
          if (gid && !existingGoogleId) {
            await prisma.calendarEvent.create({
              data: { userId, title: summary, date: w.date, type: "workout", notes: `gcalPush:${gid}` },
            }).catch(() => {});
          }
          if (gid) published++;
        }
        results.push({ provider: "google_cal_push", ok: true, imported: published });

        await prisma.connector.update({ where: { id: conn.id }, data: { lastSyncAt: new Date(), lastSyncCount: imported } });

      } else if (conn.provider === "oura") {
        let access = decryptSecret(conn.tokenEnc!);
        if (conn.expiresAt && conn.expiresAt < new Date() && conn.refreshEnc && process.env.OURA_CLIENT_ID) {
          const t = await ouraRefreshToken(
            { clientId: process.env.OURA_CLIENT_ID!, clientSecret: process.env.OURA_CLIENT_SECRET!, redirectUri: `${baseUrl}/api/connectors/oura/callback` },
            decryptSecret(conn.refreshEnc)
          );
          access = t.access_token;
          await prisma.connector.update({ where: { id: conn.id }, data: { tokenEnc: encryptSecret(t.access_token), refreshEnc: encryptSecret(t.refresh_token), expiresAt: new Date(Date.now() + t.expires_in * 1000) } });
        }
        const days = Math.min(90, Math.max(1, Math.ceil((Date.now() - since.getTime()) / 86400000)));
        const daily = await ouraGetDaily(access, days);
        let imported = 0;
        for (const d of daily) {
          const [y, m, day] = d.date.split("-").map(Number);
          if (!y) continue;
          await prisma.dailyMetrics.upsert({
            where: { userId_date: { userId, date: new Date(y, m - 1, day) } },
            create: { userId, date: new Date(y, m - 1, day), hrv: d.hrv, restingHr: d.restingHr, sleepScore: d.sleepScore, sleepHours: d.sleepHours, recoveryScore: d.readiness, source: "oura" },
            update: { hrv: d.hrv ?? undefined, restingHr: d.restingHr ?? undefined, sleepScore: d.sleepScore ?? undefined, sleepHours: d.sleepHours ?? undefined, recoveryScore: d.readiness ?? undefined, source: "oura" },
          });
          imported++;
        }
        await prisma.connector.updateMany({ where: { id: conn.id }, data: { lastSyncAt: new Date(), lastSyncCount: imported } });
        total += imported;
        results.push({ provider: "oura", ok: true, imported });

      } else if (conn.provider === "whoop") {
        let access = decryptSecret(conn.tokenEnc!);
        if (conn.expiresAt && conn.expiresAt < new Date() && conn.refreshEnc && process.env.WHOOP_CLIENT_ID) {
          const t = await whoopRefreshToken(
            { clientId: process.env.WHOOP_CLIENT_ID!, clientSecret: process.env.WHOOP_CLIENT_SECRET!, redirectUri: `${baseUrl}/api/connectors/whoop/callback` },
            decryptSecret(conn.refreshEnc)
          );
          access = t.access_token;
          await prisma.connector.update({ where: { id: conn.id }, data: { tokenEnc: encryptSecret(t.access_token), refreshEnc: encryptSecret(t.refresh_token), expiresAt: new Date(Date.now() + t.expires_in * 1000) } });
        }
        const days = Math.min(90, Math.max(1, Math.ceil((Date.now() - since.getTime()) / 86400000)));
        const daily = await whoopGetDaily(access, days);
        let imported = 0;
        for (const d of daily) {
          const [y, m, day] = d.date.split("-").map(Number);
          if (!y) continue;
          await prisma.dailyMetrics.upsert({
            where: { userId_date: { userId, date: new Date(y, m - 1, day) } },
            create: { userId, date: new Date(y, m - 1, day), hrv: d.hrv, restingHr: d.restingHr, sleepScore: d.sleepScore, sleepHours: d.sleepHours, recoveryScore: d.recoveryScore, source: "whoop" },
            update: { hrv: d.hrv ?? undefined, restingHr: d.restingHr ?? undefined, sleepScore: d.sleepScore ?? undefined, sleepHours: d.sleepHours ?? undefined, recoveryScore: d.recoveryScore ?? undefined, source: "whoop" },
          });
          imported++;
        }
        await prisma.connector.updateMany({ where: { id: conn.id }, data: { lastSyncAt: new Date(), lastSyncCount: imported } });
        total += imported;
        results.push({ provider: "whoop", ok: true, imported });

      } else {
        results.push({ provider: conn.provider, ok: false, imported: 0, error: `Provider ${conn.provider} has no sync handler (use file import)` });
      }
    } catch (e: any) {
      results.push({ provider: conn.provider, ok: false, imported: 0, error: String(e?.message || e) });
    }
  }

  // Alert the owner/admins about any failure (throttled per user+provider).
  const failures = results.filter((r) => !r.ok);
  if (failures.length) {
    try { await notifyAdminsSyncFailure(user, failures); } catch { /* never block the sync response */ }
  }

  return { results, total };
}
