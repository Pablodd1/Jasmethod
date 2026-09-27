import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { athlinksConfigured } from "@/lib/athlinks";
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const connectors = await prisma.connector.findMany({
    where: { userId: user.id },
    select: {
      provider: true,
      status: true,
      lastSyncAt: true,
      lastSyncCount: true,
      lastError: true,
      syncStartedAt: true,
    },
  });
  const configs = [
    {
      id: "strava",
      name: "Strava",
      env: "STRAVA",
      description: "Import recorded activities. Sync after connecting.",
    },
    {
      id: "google_cal",
      name: "Google Calendar",
      env: "GOOGLE",
      path: "google-cal",
      description:
        "Import busy time and publish your upcoming planned workouts.",
    },
    {
      id: "oura",
      name: "Oura",
      env: "OURA",
      description: "Import sleep, HRV and readiness. Sync after connecting.",
    },
    {
      id: "whoop",
      name: "Whoop",
      env: "WHOOP",
      description: "Import recovery, HRV and sleep; or upload cycle CSV.",
    },
  ];
  const providers: any[] = configs.map((p) => {
    const configured = !!(
      process.env[`${p.env}_CLIENT_ID`] && process.env[`${p.env}_CLIENT_SECRET`]
    );
    return {
      id: p.id,
      name: p.name,
      description: p.description,
      configured: p.id === "whoop" || configured,
      setupEnv: [`${p.env}_CLIENT_ID`, `${p.env}_CLIENT_SECRET`],
      method: configured
        ? "oauth"
        : p.id === "whoop"
          ? "upload"
          : "unavailable",
      connectUrl: configured
        ? `/api/connectors/${p.path || p.id}/authorize`
        : null,
      capabilities: { imports: true, publishesStructuredWorkouts: false, automaticDeviceDelivery: false },
      status:
        connectors.find((c) => c.provider === p.id)?.status || "disconnected",
    };
  });
  providers.push(
    ...[
      {
        id: "garmin",
        name: "Garmin / COROS",
        description:
          "Upload completed TCX or Garmin activities CSV. Automatic Garmin/COROS imports and structured workout delivery are not implemented.",
        capabilities: { imports: "file", publishesStructuredWorkouts: false, automaticDeviceDelivery: false },
      },
      {
        id: "apple",
        name: "Apple Health",
        description:
          "Upload export.xml from your Apple Health export (maximum 40 MB).",
      },
      {
        id: "athlinks",
        name: "Athlinks",
        description:
          "Your official race-history record: results, places and PRs — matched to your races automatically.",
      },
    ].map((p) => ({
      ...p,
      method: p.id === "athlinks" ? "athlinks" : "upload",
      configured: p.id === "athlinks" ? athlinksConfigured() : true,
      status:
        connectors.find((c) => c.provider === p.id)?.status || "disconnected",
    })),
  );
  return Response.json({
    providers: providers.map((p) => ({
      ...p,
      ...connectors.find((c) => c.provider === p.id),
    })),
    connectors,
  });
}
export async function DELETE(req: Request) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const { provider } = await req.json();
  await prisma.connector.updateMany({
    where: { userId: user.id, provider: String(provider) },
    data: {
      status: "disconnected",
      tokenEnc: null,
      refreshEnc: null,
      expiresAt: null,
      lastError: null,
      syncStartedAt: null,
    },
  });
  return Response.json({ ok: true });
}
