import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { estimateMonthlyCostUsd, COST_TABLE, type UsageTotals } from "@/lib/telemetry";

export const dynamic = "force-dynamic";

// GET /api/admin/ops?days=7 — operations & cost panel (admin-only).
// Errors, cron heartbeats, per-user usage, estimated costs, DB size, MAU.
export async function GET(req: Request) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (me.role !== "admin")
    return NextResponse.json({ error: "Administrator access required" }, { status: 403 });

  const url = new URL(req.url);
  const days = Math.max(1, Math.min(90, Number(url.searchParams.get("days")) || 7));
  const since = new Date(Date.now() - days * 86400000);

  // ---- Errors by kind + latest samples ----
  const [errorGroups, latestErrors, cronEvents] = await Promise.all([
    prisma.appEvent.groupBy({
      by: ["kind", "source"],
      where: { kind: "error", createdAt: { gte: since } },
      _count: { _all: true },
    }),
    prisma.appEvent.findMany({
      where: { kind: { in: ["error", "warn"] }, createdAt: { gte: since } },
      orderBy: { createdAt: "desc" },
      take: 15,
      select: { kind: true, source: true, route: true, message: true, createdAt: true },
    }),
    prisma.appEvent.findMany({
      where: { source: "cron", createdAt: { gte: since } },
      orderBy: { createdAt: "desc" },
      take: 40,
      select: { route: true, message: true, createdAt: true },
    }),
  ]);
  const errorsBySource = errorGroups.map((g) => ({
    source: g.source,
    count: g._count._all,
  }));
  const totalErrors = errorGroups.reduce((s, g) => s + g._count._all, 0);

  // ---- Cron heartbeats: last run per cron route ----
  const cronLast = new Map<string, { at: Date; message: string }>();
  for (const e of cronEvents) {
    if (!e.route || cronLast.has(e.route)) continue;
    cronLast.set(e.route, { at: e.createdAt, message: e.message.slice(0, 160) });
  }

  // ---- Usage: totals + per-user for the window ----
  const counters = await prisma.usageCounter.findMany({
    where: { day: { gte: new Date(since).toISOString().slice(0, 10) } },
  });
  const totals: UsageTotals = {
    ai_calls: 0, ai_input_tokens: 0, ai_output_tokens: 0, db_rows_synced: 0,
    fit_exports: 0, telegram_msgs: 0, email_sends: 0, gpx_uploads: 0,
  };
  const byUser = new Map<string, UsageTotals>();
  const METRICS: (keyof UsageTotals)[] = [
    "ai_calls", "ai_input_tokens", "ai_output_tokens", "db_rows_synced",
    "fit_exports", "telegram_msgs", "email_sends", "gpx_uploads",
  ];
  for (const c of counters) {
    if (!METRICS.includes(c.metric as keyof UsageTotals)) continue;
    const key = c.metric as keyof UsageTotals;
    const t = byUser.get(c.userId) ?? { ...totals };
    t[key] += c.count;
    totals[key] += c.count;
    byUser.set(c.userId, t);
  }
  const users = await prisma.user.findMany({
    where: { id: { in: Array.from(byUser.keys()) } },
    select: { id: true, name: true, email: true, avatar: true },
  });
  const nameOf = new Map(users.map((u) => [u.id, u]));
  const perUser = Array.from(byUser.entries())
    .map(([userId, t]) => ({
      userId,
      name: nameOf.get(userId)?.name || "—",
      email: nameOf.get(userId)?.email || "—",
      avatar: nameOf.get(userId)?.avatar || "🧑",
      ...t,
      estimatedCostUsd: estimateMonthlyCostUsd(t),
    }))
    .sort((a, b) => b.estimatedCostUsd - a.estimatedCostUsd)
    .slice(0, 25);

  // ---- Active users (distinct users with any session/checkin/workout today) ----
  const sinceDay = new Date(Date.now() - 86400000);
  const [activeSessions, todayCheckins] = await Promise.all([
    prisma.authSession.findMany({
      where: { expiresAt: { gt: new Date() }, createdAt: { gte: sinceDay } },
      select: { userId: true },
      distinct: ["userId"],
    }),
    prisma.dailyCheckin.findMany({
      where: { date: { gte: sinceDay } },
      select: { userId: true },
      distinct: ["userId"],
    }),
  ]);

  // ---- DB size (best-effort; works on Supabase/Postgres with privileges) ----
  let dbSizeMb: number | null = null;
  let topTables: { table: string; mb: number }[] = [];
  try {
    const sizes: { relname: string; size: string }[] = await prisma.$queryRaw`
      SELECT relname, pg_total_relation_size(relid)::text as size
      FROM pg_catalog.pg_statio_user_tables
      ORDER BY pg_total_relation_size(relid) DESC
      LIMIT 8`;
    topTables = sizes.map((s) => ({ table: s.relname, mb: +(Number(s.size) / 1048576).toFixed(2) }));
    dbSizeMb = +topTables.reduce((sum, t) => sum + t.mb, 0).toFixed(1);
  } catch {
    // no privilege — report unknown rather than guessing
  }

  const estimatedCostUsd = estimateMonthlyCostUsd(totals);

  return NextResponse.json({
    ok: true,
    days,
    window: { since: since.toISOString(), until: new Date().toISOString() },
    errors: { total: totalErrors, bySource: errorsBySource, latest: latestErrors },
    crons: Array.from(cronLast.entries()).map(([route, v]) => ({ route, ...v })),
    usage: {
      totals,
      estimatedCostUsd,
      costTable: COST_TABLE,
      note: "Costs are EDITABLE planning estimates from the price table in src/lib/telemetry.ts — not an invoice.",
      perUser,
    },
    users: {
      activeLast24h: new Set([...activeSessions.map((s) => s.userId), ...todayCheckins.map((c) => c.userId)]).size,
      total: await prisma.user.count(),
    },
    db: { sizeMb: dbSizeMb, topTables },
  });
}
