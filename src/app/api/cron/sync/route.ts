import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { syncUserConnectors } from "@/lib/sync";

// GET|POST /api/cron/sync — pull new data for EVERY athlete with connected
// devices. Scheduled daily at 05:00 America/New_York via vercel.json
// ("0 9 * * *" UTC). Vercel sends `Authorization: Bearer $CRON_SECRET`
// automatically when CRON_SECRET is set; locally (no secret configured)
// the endpoint is open for testing.
//
// Per athlete: sync every connected provider, then notify the admins about
// any failure. One aggregated admin email at the end covers all athletes.
async function run(req: Request) {
  // Auth: if CRON_SECRET is configured, require the matching bearer token.
  const secret = process.env.CRON_SECRET;
  if (!secret)
    return NextResponse.json(
      { error: "Cron is not configured" },
      { status: 503 },
    );
  if (secret) {
    const auth = req.headers.get("authorization") || "";
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const startedAt = Date.now();
  const connected = await prisma.connector.findMany({
    where: {
      status: { in: ["connected", "error"] },
      provider: { in: ["strava", "google_cal", "whoop", "oura"] },
    },
    select: { userId: true },
    distinct: ["userId"],
  });

  const perUser: {
    userId: string;
    email: string;
    name: string;
    total: number;
    failures: { provider: string; error: string }[];
  }[] = [];
  for (const { userId } of connected) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { email: true, name: true },
    });
    const { results, total } = await syncUserConnectors(userId);
    const failures = results
      .filter((r) => !r.ok)
      .map((r) => ({ provider: r.provider, error: r.error || "unknown" }));
    perUser.push({
      userId,
      email: user?.email || "?",
      name: user?.name || "?",
      total,
      failures,
    });
  }

  const failedUsers = perUser.filter((u) => u.failures.length > 0);
  const summary = {
    ranAt: new Date().toISOString(),
    durationMs: Date.now() - startedAt,
    athletes: connected.length,
    totalImported: perUser.reduce((s, u) => s + u.total, 0),
    failedAthletes: failedUsers.length,
    perUser,
  };
  console.log("[cron/sync]", JSON.stringify(summary));
  return NextResponse.json(summary);
}

export async function GET(req: Request) {
  return run(req);
}
export async function POST(req: Request) {
  return run(req);
}
