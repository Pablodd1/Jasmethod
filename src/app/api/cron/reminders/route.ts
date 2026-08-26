import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { buildReminder, buildDailyPlanMessage, sendReminder } from "@/lib/notify";
import { hrvReadiness } from "@/lib/science";

// Never prerender this route at build time — it hits the DB and is cron-only.
export const dynamic = "force-dynamic";

// GET /api/cron/reminders — fired hourly by Vercel cron (0 * * * *). Per user:
//   reminderHour < 12  → morning reminder: today's session, short.
//   reminderHour >= 12 → evening detailed plan: tomorrow's sessions in full
//                        (or day-off protocol) + readiness recommendation.
// Protected by CRON_SECRET (set as Authorization: Bearer <secret>).
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const hourInTz = (tz: string): number => {
    try {
      return Number(new Intl.DateTimeFormat("en-US", { hour: "numeric", hour12: false, timeZone: tz }).format(new Date()));
    } catch {
      return new Date().getHours();
    }
  };

  const users = await prisma.user.findMany({ include: { reminder: true } });
  let sent = 0, skipped = 0;
  for (const u of users) {
    const p = u.reminder;
    if (!p || (!p.emailEnabled && !p.telegramEnabled)) continue;
    if (hourInTz(u.timezone) !== p.reminderHour) { skipped++; continue; }

    const opts = { email: u.email, name: u.name, telegramChatId: p.telegramEnabled ? p.telegramChatId || undefined : undefined };
    const dayStart = new Date(); dayStart.setHours(0, 0, 0, 0);

    if (p.reminderHour < 12) {
      // ---- Morning: today's first planned session, short reminder ----
      const end = new Date(dayStart); end.setDate(end.getDate() + 1);
      const session = await prisma.workout.findFirst({
        where: { userId: u.id, date: { gte: dayStart, lt: end }, planned: true },
        orderBy: { date: "asc" },
      });
      const msg = buildReminder(
        u.name,
        session ? { title: session.title, durationMin: session.durationMin, intensity: session.intensity || undefined, recovery: session.recovery || undefined } : null,
      );
      await sendReminder(opts, msg);
      sent++;
      continue;
    }

    // ---- Evening (5pm default): tomorrow's detailed plan + readiness ----
    const tomorrow = new Date(dayStart); tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowEnd = new Date(tomorrow); tomorrowEnd.setDate(tomorrowEnd.getDate() + 1);

    const [sessions, metrics] = await Promise.all([
      prisma.workout.findMany({
        where: { userId: u.id, date: { gte: tomorrow, lt: tomorrowEnd }, planned: true },
        include: { planDay: true },
        orderBy: { date: "asc" },
      }),
      prisma.dailyMetrics.findMany({ where: { userId: u.id, date: { gte: new Date(Date.now() - 30 * 86400000) } }, orderBy: { date: "asc" } }),
    ]);

    // Readiness from the last 7 days of HRV (same method as /api/metrics)
    const last7 = metrics.filter((m) => m.hrv).slice(-7);
    const latest = last7[last7.length - 1];
    let readiness: { score: number; advice: string } | null = null;
    if (latest?.hrv && last7.length >= 3) {
      const baseline = last7.slice(0, -1).map((m) => m.hrv!);
      const mean = baseline.reduce((a, b) => a + b, 0) / baseline.length;
      const sd = Math.sqrt(baseline.reduce((a, b) => a + (b - mean) ** 2, 0) / baseline.length);
      const r = hrvReadiness(latest.hrv, baseline, sd);
      readiness = { score: r.score, advice: r.advice };
    }

    // A picked day off replaces the day's sessions (flag lives on the plan day).
    const dayOff = sessions.length > 0 && sessions.some((s) => s.planDay?.dayOff);
    const msg = buildDailyPlanMessage({
      name: u.name,
      dateLabel: tomorrow.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" }),
      sessions: dayOff ? [] : sessions.map((s) => ({
        title: s.title,
        durationMin: s.durationMin,
        intensity: s.intensity || undefined,
        type: s.type || undefined,
        sport: s.sport,
        description: s.planDay?.notes || undefined,
        recovery: s.recovery || undefined,
      })),
      readiness,
    });
    await sendReminder(opts, msg);
    sent++;
  }
  return NextResponse.json({ ok: true, sent, skipped });
}
