import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { stravaExchangeToken, stravaGetActivities, stravaActivityToWorkout } from "@/lib/importers";

// GET /api/connectors/strava/callback?code=...&scope=... — OAuth callback
export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const error = url.searchParams.get("error");
  if (error) {
    return NextResponse.redirect(`${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/connectors?error=${error}`);
  }
  if (!code) return NextResponse.redirect(`${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/connectors?error=missing_code`);
  if (!process.env.STRAVA_CLIENT_ID || !process.env.STRAVA_CLIENT_SECRET) {
    return NextResponse.redirect(`${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/connectors?error=not_configured`);
  }

  try {
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
    const token = await stravaExchangeToken(
      { clientId: process.env.STRAVA_CLIENT_ID, clientSecret: process.env.STRAVA_CLIENT_SECRET, redirectUri: `${baseUrl}/api/connectors/strava/callback` },
      code
    );

    // We need to attach this to the logged-in user — use a state param ideally;
    // simplest secure approach: look up session via cookie from this request.
    const { cookies } = await import("next/headers");
    const store = cookies();
    const sessionToken = store.get("jmm_session")?.value;
    if (!sessionToken) {
      return NextResponse.redirect(`${baseUrl}/connectors?error=not_logged_in`);
    }
    const { createHash } = await import("crypto");
    const { hashToken } = await import("@/lib/auth");
    const session = await prisma.authSession.findUnique({ where: { tokenHash: hashToken(sessionToken) } });
    if (!session) return NextResponse.redirect(`${baseUrl}/connectors?error=session_expired`);

    // Store token (plaintext in this demo; production: encrypt with AUTH_SECRET)
    await prisma.connector.upsert({
      where: { userId_provider: { userId: session.userId, provider: "strava" } },
      create: {
        userId: session.userId,
        provider: "strava",
        status: "connected",
        tokenEnc: token.access_token,
        refreshEnc: token.refresh_token,
        expiresAt: new Date(token.expires_at * 1000),
        scope: "activity:read_all",
      },
      update: {
        status: "connected",
        tokenEnc: token.access_token,
        refreshEnc: token.refresh_token,
        expiresAt: new Date(token.expires_at * 1000),
      },
    });

    // Import recent activities immediately
    let imported = 0;
    try {
      const activities = await stravaGetActivities(token.access_token, new Date(Date.now() - 365 * 86400000), 50);
      for (const a of activities) {
        const w = stravaActivityToWorkout(a);
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
            source: "strava",
            externalId: w.externalId,
          },
        });
        imported++;
      }
      await prisma.connector.updateMany({
        where: { userId: session.userId, provider: "strava" },
        data: { lastSyncAt: new Date(), lastSyncCount: imported },
      });
    } catch (e: any) {
      console.error("strava import failed:", e.message);
    }

    return NextResponse.redirect(`${baseUrl}/connectors?ok=strava&imported=${imported}`);
  } catch (e: any) {
    console.error("strava callback error:", e);
    return NextResponse.redirect(`${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/connectors?error=${encodeURIComponent(e.message || "failed")}`);
  }
}
