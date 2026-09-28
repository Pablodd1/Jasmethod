import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { trainingAccess, errorResponse, ApiError } from "@/lib/access";
import { encryptSecret } from "@/lib/crypto";
import { intervalsVerifyKey } from "@/lib/intervals";
import { logEvent } from "@/lib/telemetry";

export const dynamic = "force-dynamic";

// POST /api/connectors/intervals/connect — { apiKey }
// Intervals.icu uses per-athlete API keys (Settings → Developer Settings),
// not OAuth — so the connect flow is a verified key paste. The key is
// validated against their API before anything is stored.
// athleteId (query) lets a COACH/admin paste the key on the athlete's behalf
// (athlete reads it to them / shares screen) — consent is the athlete handing
// over their own key; trainingAccess enforces coach relationship or self.
export async function POST(req: Request) {
  try {
    const { actor, athlete } = await trainingAccess(req);
    const body = await req.json().catch(() => ({}));
    const apiKey = String(body?.apiKey || "").trim();
    if (apiKey.length < 10)
      throw new ApiError(
        "Paste the API key from Intervals.icu → Settings → Developer Settings.",
      );
    const check = await intervalsVerifyKey(apiKey);
    if (!check.ok) throw new ApiError(check.error || "Key rejected");
    await prisma.connector.upsert({
      where: { userId_provider: { userId: athlete.id, provider: "intervals" } },
      create: {
        userId: athlete.id,
        provider: "intervals",
        status: "connected",
        tokenEnc: encryptSecret(apiKey),
        scope: "api_key",
        lastSyncAt: new Date(),
      },
      update: {
        status: "connected",
        tokenEnc: encryptSecret(apiKey),
        lastError: null,
        lastSyncAt: new Date(),
      },
    });
    await logEvent({
      kind: "info",
      source: "sync",
      route: "/api/connectors/intervals/connect",
      message: `user=${athlete.id} intervals connected (${check.athlete}) by ${actor.id === athlete.id ? "athlete" : "coach"}`,
    });
    return NextResponse.json({ ok: true, athlete: check.athlete });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function DELETE(req: Request) {
  try {
    const { athlete } = await trainingAccess(req);
    await prisma.connector.deleteMany({ where: { userId: athlete.id, provider: "intervals" } });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
