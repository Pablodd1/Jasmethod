import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { syncUserConnectors } from "@/lib/sync";
import { syncAthlinksForAllUsers } from "@/lib/athlinks";
import { alertOwner, logEvent } from "@/lib/telemetry";

// GET|POST /api/cron/sync — reconcile every athlete's connected providers.
// Runs HOURLY via vercel.json ("0 * * * *" UTC) — the normal user experience
// never requires pressing Sync (webhooks handle real-time; this is the safety
// net for missed events). Vercel sends `Authorization: Bearer $CRON_SECRET`
// automatically when CRON_SECRET is set.
//
// Athlinks (race-history) reconciles at most once per 20h per athlete — race
// results don't change minute to minute — enforced by lastSyncAt here.
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
    profileSynced?: Record<string, unknown>;
  }[] = [];
  for (const { userId } of connected) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { email: true, name: true },
    });
    const { results, total, profileSynced } = await syncUserConnectors(userId);
    const failures = results
      .filter((r) => !r.ok)
      .map((r) => ({ provider: r.provider, error: r.error || "unknown" }));
    perUser.push({
      userId,
      email: user?.email || "?",
      name: user?.name || "?",
      total,
      failures,
      profileSynced: profileSynced || undefined,
    });
  }

  // Athlinks race-history reconciliation — stale >20h only (daily cadence).
  let athlinks: Awaited<ReturnType<typeof syncAthlinksForAllUsers>> | null = null;
  const staleAthlinks = await prisma.connector.findMany({
    where: {
      provider: "athlinks",
      status: { in: ["connected", "error"] },
      externalRef: { not: null },
      OR: [{ lastSyncAt: null }, { lastSyncAt: { lt: new Date(Date.now() - 20 * 3600000) } }],
    },
    select: { id: true },
  });
  if (staleAthlinks.length) athlinks = await syncAthlinksForAllUsers();

  const failedUsers = perUser.filter((u) => u.failures.length > 0);
  // Owner alert: device auth failures mean silently-dead connectors (the
  // athlete stopped getting data). Rate-limited 12h per kind.
  for (const u of failedUsers) {
    for (const f of u.failures) {
      if (/reconnect|expired|authorization|unauthorized|invalid/i.test(f.error)) {
        await alertOwner(
          "sync_auth",
          `${u.name} — ${f.provider}: ${f.error}`,
          { cooldownMin: 720 },
        );
      }
    }
  }
  const summary = {
    ranAt: new Date().toISOString(),
    durationMs: Date.now() - startedAt,
    athletes: connected.length,
    totalImported: perUser.reduce((s, u) => s + u.total, 0),
    failedAthletes: failedUsers.length,
    athlinks: athlinks
      ? { users: athlinks.users, imported: athlinks.imported, merged: athlinks.merged, errors: athlinks.errors }
      : { skipped: true },
    perUser,
  };
  console.log("[cron/sync]", JSON.stringify(summary));
  await logEvent({ kind: failedUsers.length ? "warn" : "info", source: "cron", route: "/api/cron/sync", message: "athletes=" + connected.length + " imported=" + summary.totalImported + " failed=" + failedUsers.length });
  return NextResponse.json(summary);
}

export async function GET(req: Request) {
  return run(req);
}
export async function POST(req: Request) {
  return run(req);
}
