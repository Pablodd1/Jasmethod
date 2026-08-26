import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { buildReminder, sendReminder } from "@/lib/notify";

// GET /api/cron/reminders — fired hourly by Vercel cron. Sends the training
// reminder to each athlete whose reminder hour matches the current hour in
// their timezone. Protected by CRON_SECRET (set as Authorization: Bearer).
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

    const start = new Date(); start.setHours(0, 0, 0, 0);
    const end = new Date(start); end.setDate(end.getDate() + 1);
    const session = await prisma.workout.findFirst({
      where: { userId: u.id, date: { gte: start, lt: end }, planned: true },
      orderBy: { date: "asc" },
    });
    const msg = buildReminder(
      u.name,
      session ? { title: session.title, durationMin: session.durationMin, intensity: session.intensity || undefined, recovery: session.recovery || undefined } : null,
    );
    await sendReminder(
      { email: u.email, name: u.name, telegramChatId: p.telegramEnabled ? p.telegramChatId || undefined : undefined },
      msg,
    );
    sent++;
  }
  return NextResponse.json({ ok: true, sent, skipped });
}
