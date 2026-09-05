import { NextResponse } from "next/server";
import { encryptSecret } from "@/lib/crypto";
import { prisma } from "@/lib/db";
import { garminExchangeToken, garminGetActivities, garminActivityToWorkout } from "@/lib/importers";

// GET /api/connectors/garmin/callback?code=... — OAuth callback
export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const error = url.searchParams.get("error");
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  if (error) return NextResponse.redirect(`${baseUrl}/connectors?error=${error}`);
  if (!code) return NextResponse.redirect(`${baseUrl}/connectors?error=missing_code`);
  if (!process.env.GARMIN_CLIENT_ID || !process.env.GARMIN_CLIENT_SECRET) {
    return NextResponse.redirect(`${baseUrl}/connectors?error=not_configured`);
  }

  try {
    const token = await garminExchangeToken(
      { clientId: process.env.GARMIN_CLIENT_ID, clientSecret: process.env.GARMIN_CLIENT_SECRET, redirectUri: `${baseUrl}/api/connectors/garmin/callback` },
      code
    );

    const { cookies } = await import("next/headers");
    const store = cookies();
    const sessionToken = store.get("jmm_session")?.value;
    if (!sessionToken) return NextResponse.redirect(`${baseUrl}/connectors?error=not_logged_in`);
    const { createHash } = await import("crypto");
    const { hashToken } = await import("@/lib/auth");
    const session = await prisma.authSession.findUnique({ where: { tokenHash: hashToken(sessionToken) } });
    if (!session) return NextResponse.redirect(`${baseUrl}/connectors?error=session_expired`);

    await prisma.connector.upsert({
      where: { userId_provider: { userId: session.userId, provider: "garmin" } },
      create: {
        userId: session.userId,
        provider: "garmin",
        status: "connected",
        tokenEnc: encryptSecret(token.access_token),
        refreshEnc: encryptSecret(token.refresh_token),
        expiresAt: new Date(Date.now() + (token.expires_in || 3600) * 1000),
        scope: "activities",
      },
      update: {
        status: "connected",
        tokenEnc: encryptSecret(token.access_token),
        refreshEnc: encryptSecret(token.refresh_token),
        expiresAt: new Date(Date.now() + (token.expires_in || 3600) * 1000),
      },
    });

    let imported = 0;
    try {
      const activities = await garminGetActivities(token.access_token, new Date(Date.now() - 365 * 86400000));
      for (const a of activities) {
        const w = garminActivityToWorkout(a);
        const existing = await prisma.workout.findFirst({ where: { userId: session.userId, externalId: w.externalId } });
        if (existing) continue;
        await prisma.workout.create({
          data: {
            userId: session.userId,
            date: w.date,
            sport: w.sport,
            title: w.title,
            type: "endurance",
            durationMin: w.durationMin,
            distanceKm: w.distanceKm,
            avgHr: w.avgHr,
            maxHr: w.maxHr,
            avgPower: w.avgPower,
            calories: w.calories,
            planned: false,
            completed: true,
            source: "garmin",
            externalId: w.externalId,
          },
        });
        imported++;
      }
      await prisma.connector.update({
        where: { userId_provider: { userId: session.userId, provider: "garmin" } },
        data: { lastSyncAt: new Date(), lastSyncCount: imported },
      });
    } catch (e: any) {
      // Sync failure shouldn't kill the connection — user can retry sync later
      console.error("Garmin initial sync failed:", e.message);
    }

    return NextResponse.redirect(`${baseUrl}/connectors?garmin=connected&imported=${imported}`);
  } catch (e: any) {
    console.error("Garmin callback error:", e.message);
    return NextResponse.redirect(`${baseUrl}/connectors?error=callback_failed`);
  }
}
