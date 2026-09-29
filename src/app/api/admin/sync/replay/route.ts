import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { randomUUID } from "node:crypto";

export const dynamic = "force-dynamic";

// POST /api/admin/sync/replay — operator tool for stuck syncs.
// Body: { userId, provider? }  → re-enqueues a sync job NOW and, when a
// connector is wedged in error state, clears it so the normal pipeline
// picks the athlete back up (the owner reconnect flow still governs auth).
export async function POST(req: Request) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (me.role !== "admin")
    return NextResponse.json({ error: "Administrator access required" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const userId = String(body?.userId || "");
  const provider = body?.provider ? String(body.provider) : null;
  if (!userId)
    return NextResponse.json({ error: "userId required" }, { status: 400 });

  const where = provider
    ? { userId, provider, status: { in: ["connected", "error"] } }
    : { userId, status: { in: ["connected", "error"] } };
  const connectors = await prisma.connector.findMany({
    where,
    select: { id: true, provider: true, status: true, lastError: true },
  });
  if (!connectors.length)
    return NextResponse.json(
      { error: "No matching connectors for this athlete" },
      { status: 404 },
    );

  // Clear wedged error state so reconciliation (which retries error-state
  // connectors) treats them as live again.
  // Lease safety (Codex review P1-9): a retry may still be RUNNING under a
  // live lease (syncStartedAt < 10 min). Clearing syncStartedAt here would let
  // a second worker overlap it. Only expired leases are released.
  const cleared = await prisma.connector.updateMany({
    where: {
      id: { in: connectors.filter((c) => c.status === "error").map((c) => c.id) },
      OR: [{ syncStartedAt: null }, { syncStartedAt: { lt: new Date(Date.now() - 10 * 60000) } }],
    },
    data: { status: "connected", syncStartedAt: null },
  });

  // Enqueue one job per provider with a fresh dedupe key so replay always runs.
  const enqueued = [];
  for (const c of connectors) {
    const job = await prisma.syncJob.create({
      data: {
        userId,
        kind: "sync",
        dedupeKey: `replay:${c.provider}:${userId}:${randomUUID().slice(0, 8)}`,
        payload: JSON.stringify({ provider: c.provider }),
      },
    });
    enqueued.push({ provider: c.provider, jobId: job.id });
  }

  // Kick the worker immediately rather than waiting up to 5 min for cron.
  let kicked = 0;
  try {
    const { runSyncJobs } = await import("@/lib/background-jobs");
    const result = await runSyncJobs(6);
    kicked = result.filter((r: any) => r.status === "done").length;
  } catch {
    // Cron worker picks it up regardless — the enqueue is the durable part.
  }

  return NextResponse.json({
    ok: true,
    connectors: connectors.length,
    errorStateCleared: cleared.count,
    enqueued,
    jobsCompletedNow: kicked,
  });
}
