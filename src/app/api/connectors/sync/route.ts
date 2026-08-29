import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import {
  stravaRefreshToken, stravaGetActivities, stravaActivityToWorkout,
  garminRefreshToken, garminGetActivities, garminActivityToWorkout,
  googleCalRefreshToken, googleCalGetEvents,
} from "@/lib/importers";

// POST /api/connectors/sync — re-pull data from every connected provider.
// Incremental: only fetch activities since lastSyncAt (or 30 days if never).
export async function POST() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const connectors = await prisma.connector.findMany({ where: { userId: user.id, status: "connected" } });
  if (connectors.length === 0) return NextResponse.json({ synced: [], total: 0, message: "No connected devices. Connect Strava, Garmin, or Google Calendar first." });

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const results: { provider: string; imported: number; error?: string }[] = [];
  let total = 0;

  for (const conn of connectors) {
    const since = conn.lastSyncAt ? new Date(conn.lastSyncAt.getTime() - 86400000) : new Date(Date.now() - 30 * 86400000);
    try {
      if (conn.provider === "strava") {
        let access = conn.tokenEnc!;
        if (conn.expiresAt && conn.expiresAt < new Date() && conn.refreshEnc && process.env.STRAVA_CLIENT_ID) {
          const t = await stravaRefreshToken(
            { clientId: process.env.STRAVA_CLIENT_ID!, clientSecret: process.env.STRAVA_CLIENT_SECRET!, redirectUri: `${baseUrl}/api/connectors/strava/callback` },
            conn.refreshEnc
          );
          access = t.access_token;
          await prisma.connector.update({ where: { id: conn.id }, data: { tokenEnc: t.access_token, refreshEnc: t.refresh_token, expiresAt: new Date(t.expires_at * 1000) } });
        }
        const activities = await stravaGetActivities(access, since, 30);
        let imported = 0;
        for (const a of activities) {
          const w = stravaActivityToWorkout(a);
          const existing = await prisma.workout.findFirst({ where: { userId: user.id, externalId: w.externalId } });
          if (existing) continue;
          await prisma.workout.create({ data: { userId: user.id, date: w.date, sport: w.sport, title: w.title, type: "endurance", durationMin: w.durationMin, distanceKm: w.distanceKm, avgHr: w.avgHr, maxHr: w.maxHr, avgPower: w.avgPower, calories: w.calories, planned: false, completed: true, source: "strava", externalId: w.externalId } });
          imported++;
        }
        total += imported;
        results.push({ provider: "strava", imported });
        await prisma.connector.update({ where: { id: conn.id }, data: { lastSyncAt: new Date(), lastSyncCount: imported } });
      } else if (conn.provider === "garmin") {
        let access = conn.tokenEnc!;
        if (conn.expiresAt && conn.expiresAt < new Date() && conn.refreshEnc && process.env.GARMIN_CLIENT_ID) {
          const t = await garminRefreshToken(
            { clientId: process.env.GARMIN_CLIENT_ID!, clientSecret: process.env.GARMIN_CLIENT_SECRET!, redirectUri: `${baseUrl}/api/connectors/garmin/callback` },
            conn.refreshEnc
          );
          access = t.access_token;
          await prisma.connector.update({ where: { id: conn.id }, data: { tokenEnc: t.access_token, refreshEnc: t.refresh_token, expiresAt: new Date(Date.now() + (t.expires_in || 3600) * 1000) } });
        }
        const activities = await garminGetActivities(access, since);
        let imported = 0;
        for (const a of activities) {
          const w = garminActivityToWorkout(a);
          const existing = await prisma.workout.findFirst({ where: { userId: user.id, externalId: w.externalId } });
          if (existing) continue;
          await prisma.workout.create({ data: { userId: user.id, date: w.date, sport: w.sport, title: w.title, type: "endurance", durationMin: w.durationMin, distanceKm: w.distanceKm, avgHr: w.avgHr, maxHr: w.maxHr, avgPower: w.avgPower, calories: w.calories, planned: false, completed: true, source: "garmin", externalId: w.externalId } });
          imported++;
        }
        total += imported;
        results.push({ provider: "garmin", imported });
        await prisma.connector.update({ where: { id: conn.id }, data: { lastSyncAt: new Date(), lastSyncCount: imported } });
      } else if (conn.provider === "google_cal") {
        let access = conn.tokenEnc!;
        if (conn.expiresAt && conn.expiresAt < new Date() && conn.refreshEnc && process.env.GOOGLE_CLIENT_ID) {
          const t = await googleCalRefreshToken(
            { clientId: process.env.GOOGLE_CLIENT_ID!, clientSecret: process.env.GOOGLE_CLIENT_SECRET!, redirectUri: `${baseUrl}/api/connectors/google-cal/callback` },
            conn.refreshEnc
          );
          access = t.access_token;
          await prisma.connector.update({ where: { id: conn.id }, data: { tokenEnc: t.access_token, refreshEnc: t.refresh_token, expiresAt: new Date(Date.now() + (t.expires_in || 3600) * 1000) } });
        }
        const events = await googleCalGetEvents(access, 14);
        let imported = 0;
        for (const ev of events) {
          const start = ev.start?.dateTime || ev.start?.date;
          if (!start) continue;
          const title = ev.summary || "Busy";
          const existing = await prisma.calendarEvent.findFirst({ where: { userId: user.id, title, date: new Date(start), type: "appointment" } });
          if (existing) continue;
          await prisma.calendarEvent.create({ data: { userId: user.id, title, date: new Date(start), startTime: ev.start?.dateTime ? start : null, endTime: ev.end?.dateTime || null, type: "appointment", notes: `google_cal:${ev.id}` } });
          imported++;
        }
        total += imported;
        results.push({ provider: "google_cal", imported });
        await prisma.connector.update({ where: { id: conn.id }, data: { lastSyncAt: new Date(), lastSyncCount: imported } });
      }
    } catch (e: any) {
      results.push({ provider: conn.provider, imported: 0, error: e.message });
    }
  }

  return NextResponse.json({ synced: results, total, message: `Synced ${total} new record${total === 1 ? "" : "s"} from ${results.length} device${results.length === 1 ? "" : "s"}.` });
}
