import { NextResponse } from "next/server";
import { encryptSecret } from "@/lib/crypto";
import { prisma } from "@/lib/db";
import { googleCalExchangeToken, googleCalGetEvents } from "@/lib/importers";

// GET /api/connectors/google-cal/callback?code=... — Google Calendar OAuth
export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const error = url.searchParams.get("error");
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  if (error) return NextResponse.redirect(`${baseUrl}/connectors?error=${error}`);
  if (!code) return NextResponse.redirect(`${baseUrl}/connectors?error=missing_code`);
  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
    return NextResponse.redirect(`${baseUrl}/connectors?error=not_configured`);
  }

  try {
    const token = await googleCalExchangeToken(
      { clientId: process.env.GOOGLE_CLIENT_ID, clientSecret: process.env.GOOGLE_CLIENT_SECRET, redirectUri: `${baseUrl}/api/connectors/google-cal/callback` },
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
      where: { userId_provider: { userId: session.userId, provider: "google_cal" } },
      create: {
        userId: session.userId,
        provider: "google_cal",
        status: "connected",
        tokenEnc: encryptSecret(token.access_token),
        refreshEnc: encryptSecret(token.refresh_token),
        expiresAt: new Date(Date.now() + (token.expires_in || 3600) * 1000),
        scope: "calendar.readonly",
      },
      update: {
        status: "connected",
        tokenEnc: encryptSecret(token.access_token),
        refreshEnc: encryptSecret(token.refresh_token),
        expiresAt: new Date(Date.now() + (token.expires_in || 3600) * 1000),
      },
    });

    // Import events as appointments (blocked time the coach must respect)
    let imported = 0;
    try {
      const events = await googleCalGetEvents(token.access_token, 14);
      for (const ev of events) {
        // Skip all-day? No — all-day events also block the day. Import them.
        const start = ev.start?.dateTime || ev.start?.date;
        if (!start) continue;
        const title = ev.summary || "Busy";
        const existing = await prisma.calendarEvent.findFirst({
          where: { userId: session.userId, title, date: new Date(start), type: "appointment" },
        });
        if (existing) continue;
        await prisma.calendarEvent.create({
          data: {
            userId: session.userId,
            title,
            date: new Date(start),
            startTime: ev.start?.dateTime ? start : null,
            endTime: ev.end?.dateTime || null,
            type: "appointment",
            notes: `google_cal:${ev.id}`,
          },
        });
        imported++;
      }
      await prisma.connector.update({
        where: { userId_provider: { userId: session.userId, provider: "google_cal" } },
        data: { lastSyncAt: new Date(), lastSyncCount: imported },
      });
    } catch (e: any) {
      console.error("Google calendar import failed:", e.message);
    }

    return NextResponse.redirect(`${baseUrl}/calendar?gcal=connected&imported=${imported}`);
  } catch (e: any) {
    console.error("Google callback error:", e.message);
    return NextResponse.redirect(`${baseUrl}/connectors?error=callback_failed`);
  }
}
