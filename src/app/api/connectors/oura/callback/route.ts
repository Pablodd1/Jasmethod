import { NextResponse } from "next/server";
import { encryptSecret } from "@/lib/crypto";
import { prisma } from "@/lib/db";
import { ouraExchangeToken, ouraGetDaily } from "@/lib/importers";

// GET /api/connectors/oura/callback?code=... — OAuth callback
export async function GET(req: Request) {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const error = url.searchParams.get("error");
  if (error) return NextResponse.redirect(`${baseUrl}/connectors?error=${error}`);
  if (!code) return NextResponse.redirect(`${baseUrl}/connectors?error=missing_code`);
  if (!process.env.OURA_CLIENT_ID || !process.env.OURA_CLIENT_SECRET) {
    return NextResponse.redirect(`${baseUrl}/connectors?error=not_configured`);
  }

  try {
    const token = await ouraExchangeToken(
      { clientId: process.env.OURA_CLIENT_ID, clientSecret: process.env.OURA_CLIENT_SECRET, redirectUri: `${baseUrl}/api/connectors/oura/callback` },
      code
    );
    const { cookies } = await import("next/headers");
    const { hashToken } = await import("@/lib/auth");
    const sessionToken = cookies().get("jmm_session")?.value;
    if (!sessionToken) return NextResponse.redirect(`${baseUrl}/connectors?error=not_logged_in`);
    const session = await prisma.authSession.findUnique({ where: { tokenHash: hashToken(sessionToken) } });
    if (!session) return NextResponse.redirect(`${baseUrl}/connectors?error=session_expired`);

    await prisma.connector.upsert({
      where: { userId_provider: { userId: session.userId, provider: "oura" } },
      create: {
        userId: session.userId, provider: "oura", status: "connected",
        tokenEnc: encryptSecret(token.access_token), refreshEnc: encryptSecret(token.refresh_token),
        expiresAt: new Date(Date.now() + token.expires_in * 1000),
        scope: "daily sleep readiness hrv",
      },
      update: { status: "connected", tokenEnc: encryptSecret(token.access_token), refreshEnc: encryptSecret(token.refresh_token), expiresAt: new Date(Date.now() + token.expires_in * 1000) },
    });

    // Import immediately — daily rows land in DailyMetrics (HRV/RHR/sleep feed the check-in baselines)
    let imported = 0;
    try {
      const daily = await ouraGetDaily(token.access_token, 30);
      for (const d of daily) {
        const [y, m, day] = d.date.split("-").map(Number);
        if (!y) continue;
        await prisma.dailyMetrics.upsert({
          where: { userId_date: { userId: session.userId, date: new Date(y, m - 1, day) } },
          create: { userId: session.userId, date: new Date(y, m - 1, day), hrv: d.hrv, restingHr: d.restingHr, sleepScore: d.sleepScore, sleepHours: d.sleepHours, recoveryScore: d.readiness, source: "oura" },
          update: { hrv: d.hrv ?? undefined, restingHr: d.restingHr ?? undefined, sleepScore: d.sleepScore ?? undefined, sleepHours: d.sleepHours ?? undefined, recoveryScore: d.readiness ?? undefined, source: "oura" },
        });
        imported++;
      }
      await prisma.connector.updateMany({ where: { userId: session.userId, provider: "oura" }, data: { lastSyncAt: new Date(), lastSyncCount: imported } });
    } catch (e: any) {
      console.error("oura import failed:", e.message);
    }

    return NextResponse.redirect(`${baseUrl}/connectors?ok=oura&imported=${imported}`);
  } catch (e: any) {
    console.error("oura callback error:", e);
    return NextResponse.redirect(`${baseUrl}/connectors?error=${encodeURIComponent(e.message || "failed")}`);
  }
}
