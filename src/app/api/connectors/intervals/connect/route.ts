import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { encryptSecret } from "@/lib/crypto";
import { intervalsVerifyKey } from "@/lib/intervals";
import { logEvent } from "@/lib/telemetry";

export const dynamic = "force-dynamic";

// POST /api/connectors/intervals/connect — { apiKey }
// Intervals.icu uses per-athlete API keys (Settings → Developer Settings),
// not OAuth — so the connect flow is a verified key paste. The key is
// validated against their API before anything is stored.
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const body = await req.json().catch(() => ({}));
    const apiKey = String(body?.apiKey || "").trim();
    if (apiKey.length < 10)
      return NextResponse.json(
        { error: "Paste the API key from Intervals.icu → Settings → Developer Settings." },
        { status: 400 },
      );
    const check = await intervalsVerifyKey(apiKey);
    if (!check.ok)
      return NextResponse.json({ error: check.error || "Key rejected" }, { status: 400 });
    await prisma.connector.upsert({
      where: { userId_provider: { userId: user.id, provider: "intervals" } },
      create: {
        userId: user.id,
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
      message: `user=${user.id} intervals connected (${check.athlete})`,
    });
    return NextResponse.json({ ok: true, athlete: check.athlete });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Failed" }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  await prisma.connector.deleteMany({ where: { userId: user.id, provider: "intervals" } });
  return NextResponse.json({ ok: true });
}
