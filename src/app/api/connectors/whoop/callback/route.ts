import { NextResponse } from "next/server";
import { encryptSecret } from "@/lib/crypto";
import { prisma } from "@/lib/db";
import { whoopExchangeToken, whoopGetDaily } from "@/lib/importers";

// GET /api/connectors/whoop/callback?code=... — OAuth callback
export async function GET(req: Request) {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const error = url.searchParams.get("error");
  if (error) return NextResponse.redirect(`${baseUrl}/connectors?error=${error}`);
  if (!code) return NextResponse.redirect(`${baseUrl}/connectors?error=missing_code`);
  if (!process.env.WHOOP_CLIENT_ID || !process.env.WHOOP_CLIENT_SECRET) {
    return NextResponse.redirect(`${baseUrl}/connectors?error=not_configured`);
  }

  try {
    const token = await whoopExchangeToken(
      { clientId: process.env.WHOOP_CLIENT_ID, clientSecret: process.env.WHOOP_CLIENT_SECRET, redirectUri: `${baseUrl}/api/connectors/whoop/callback` },
      code
    );
    const { cookies } = await import("next/headers");
    const { hashToken } = await import("@/lib/auth");
    const sessionToken = cookies().get("jmm_session")?.value;
    if (!sessionToken) return NextResponse.redirect(`${baseUrl}/connectors?error=not_logged_in`);
    const session = await prisma.authSession.findUnique({ where: { tokenHash: hashToken(sessionToken) } });
    if (!session) return NextResponse.redirect(`${baseUrl}/connectors?error=session_expired`);

    // Fetch the Whoop user id (basic profile) so webhooks can match events to
    // this athlete; stored in externalRef like the Strava connector does.
    let whoopUserId: string | undefined;
    try {
      const prof = await fetch("https://api.prod.whoop.com/developer/v1/user/profile/basic", {
        headers: { Authorization: `Bearer ${token.access_token}` },
      });
      if (prof.ok) {
        const pd = await prof.json();
        whoopUserId = pd?.id != null ? String(pd.id) : undefined;
      }
    } catch { /* best-effort */ }

    await prisma.connector.upsert({
      where: { userId_provider: { userId: session.userId, provider: "whoop" } },
      create: {
        userId: session.userId, provider: "whoop", status: "connected",
        tokenEnc: encryptSecret(token.access_token), refreshEnc: encryptSecret(token.refresh_token),
        expiresAt: new Date(Date.now() + token.expires_in * 1000),
        scope: "read:recovery read:sleep read:cycles",
        externalRef: whoopUserId,
      },
      update: { status: "connected", tokenEnc: encryptSecret(token.access_token), refreshEnc: encryptSecret(token.refresh_token), expiresAt: new Date(Date.now() + token.expires_in * 1000), ...(whoopUserId ? { externalRef: whoopUserId } : {}) },
    });

    let imported = 0;
    try {
      const daily = await whoopGetDaily(token.access_token, 30);
      for (const d of daily) {
        const [y, m, day] = d.date.split("-").map(Number);
        if (!y) continue;
        await prisma.dailyMetrics.upsert({
          where: { userId_date: { userId: session.userId, date: new Date(y, m - 1, day) } },
          create: { userId: session.userId, date: new Date(y, m - 1, day), hrv: d.hrv, restingHr: d.restingHr, sleepScore: d.sleepScore, sleepHours: d.sleepHours, recoveryScore: d.recoveryScore, source: "whoop" },
          update: { hrv: d.hrv ?? undefined, restingHr: d.restingHr ?? undefined, sleepScore: d.sleepScore ?? undefined, sleepHours: d.sleepHours ?? undefined, recoveryScore: d.recoveryScore ?? undefined, source: "whoop" },
        });
        imported++;
      }
      await prisma.connector.updateMany({ where: { userId: session.userId, provider: "whoop" }, data: { lastSyncAt: new Date(), lastSyncCount: imported } });
    } catch (e: any) {
      console.error("whoop import failed:", e.message);
    }

    return NextResponse.redirect(`${baseUrl}/connectors?ok=whoop&imported=${imported}`);
  } catch (e: any) {
    console.error("whoop callback error:", e);
    return NextResponse.redirect(`${baseUrl}/connectors?error=${encodeURIComponent(e.message || "failed")}`);
  }
}
