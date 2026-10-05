import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { intervalsConnectorEnabled } from "@/lib/capabilities";
import { readIntervalsAutoPublish } from "@/lib/intervals-preferences";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const connector = await prisma.connector.findUnique({ where: { userId_provider: { userId: user.id, provider: "intervals" } }, select: { externalRef: true } });
  return Response.json({ enabled: connector?.externalRef ? await readIntervalsAutoPublish(user.id, connector.externalRef) : false,
    available: intervalsConnectorEnabled() && process.env.ENABLE_INTERVALS_AUTO_PUBLISH === "true" });
}

export async function PUT(req: Request) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => null);
  if (typeof body?.enabled !== "boolean") return Response.json({ error: "Choose whether to enable automatic publication." }, { status: 400 });
  const connector = await prisma.connector.findUnique({ where: { userId_provider: { userId: user.id, provider: "intervals" } }, select: { externalRef: true, status: true, scope: true, tokenEnc: true } });
  if (body.enabled && (!intervalsConnectorEnabled() || process.env.ENABLE_INTERVALS_AUTO_PUBLISH !== "true")) return Response.json({ error: "Automatic publication is not enabled on this server." }, { status: 503 });
  if (body.enabled && (connector?.status !== "connected" || !connector.externalRef || !connector.tokenEnc?.startsWith("enc:v1:") || !connector.scope?.split(",").includes("CALENDAR:WRITE"))) return Response.json({ error: "Connect Intervals.icu with calendar permission first." }, { status: 409 });
  const data = { actorId: user.id, subjectId: user.id, action: "intervals.auto_publish", after: JSON.stringify({ version: 1, enabled: body.enabled, externalRef: connector?.externalRef ?? null }) };
  if (body.enabled) {
    const saved = await prisma.$transaction(async tx => {
      // Claim the same row disconnect locks before writing its opt-out audit.
      // The credential predicate also rejects a disconnect/reconnect in between.
      const claim = await tx.connector.updateMany({ where: { userId: user.id, provider: "intervals", status: "connected",
        externalRef: connector!.externalRef, tokenEnc: connector!.tokenEnc, scope: connector!.scope }, data: { status: "connected" } });
      if (claim.count !== 1) return false;
      await tx.auditLog.create({ data });
      return true;
    });
    if (!saved) return Response.json({ error: "Your connection changed. Refresh and choose again." }, { status: 409 });
  } else {
    await prisma.auditLog.create({ data });
  }
  return Response.json({ enabled: body.enabled, note: "Turning this off stops new automatic publications. Already published workouts remain scheduled and continue to receive safety updates or cancellations." });
}
