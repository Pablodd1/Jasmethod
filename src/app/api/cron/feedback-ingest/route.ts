import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { dayBounds, addDaysKey, localDate } from "@/lib/dates";
import { logEvent } from "@/lib/telemetry";

export const dynamic = "force-dynamic";

// GET /api/cron/feedback-ingest — cron (hourly): scan the app bot's recent
// Telegram messages for one-tap session feedback (1 = easier / 2 = as
// expected / 3 = harder) and apply it as sessionFelt on the athlete's
// check-in so tomorrow adapts. Numbers map: 1 → easier, 2 → normal,
// 3 → harder. Free-text replies are stored as a note on the workout.
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret)
    return NextResponse.json({ error: "Cron is not configured" }, { status: 503 });
  if (req.headers.get("authorization") !== `Bearer ${secret}`)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token)
    return NextResponse.json({ ok: true, skipped: "no bot token" });

  const updatesRes = await fetch(
    `https://api.telegram.org/bot${token}/getUpdates?limit=100&allowed_updates=["message"]`,
  ).catch(() => null);
  if (!updatesRes || !updatesRes.ok)
    return NextResponse.json({ ok: true, skipped: "telegram unreachable" });
  const data = await updatesRes.json();
  const updates: any[] = data.result || [];

  let applied = 0;
  const results: string[] = [];
  for (const u of updates) {
    const msg = u.message;
    if (!msg?.chat?.id || !msg?.text) continue;
    const chatId = String(msg.chat.id);
    const text = String(msg.text).trim();

    // Only handle bare numeric replies (1/2/3) — pairing codes are 6-char
    // alphanumeric, commands start with /, everything else is ignored.
    if (!/^[123]$/.test(text)) continue;

    // Find the athlete bound to this chat.
    const pref = await prisma.reminderPref.findFirst({
      where: { telegramChatId: chatId, telegramEnabled: true },
      select: { userId: true },
    });
    if (!pref) continue;
    const userId = pref.userId;

    // Don't double-apply: skip if this update was already processed.
    const already = await prisma.appEvent.count({
      where: {
        source: "delivery",
        route: "feedback-ingest",
        meta: { contains: String(u.update_id) },
      },
    });
    if (already) continue;

    // The athlete's most recent UNCOMPLETED planned session within the last
    // 2 days (yesterday's evening prompt asks about today's session).
    const since = new Date(Date.now() - 2 * 86400000);
    const session = await prisma.workout.findFirst({
      where: {
        userId,
        planned: true,
        completed: true,
        date: { gte: since },
      },
      orderBy: { date: "desc" },
      select: { id: true, title: true },
    });
    if (!session) continue;

    const felt = text === "1" ? "easier" : text === "2" ? "normal" : "harder";
    const label = text === "1" ? "easier" : text === "2" ? "as expected" : "harder";

    // Apply to the LATEST check-in (yesterday's or today's) — sessionFelt is
    // the prescription-mismatch signal the adaptation engine already uses.
    const checkin = await prisma.dailyCheckin.findFirst({
      where: { userId, answers: { not: null } },
      orderBy: { date: "desc" },
      select: { id: true, date: true, answers: true },
    });
    if (checkin) {
      try {
        const ans = JSON.parse(checkin.answers || "{}");
        ans.sessionFelt = felt;
        await prisma.dailyCheckin.update({
          where: { id: checkin.id },
          data: { answers: JSON.stringify(ans) },
        });
      } catch {}
    }

    await prisma.appEvent.create({
      data: {
        kind: "info",
        source: "delivery",
        route: "feedback-ingest",
        userId,
        message: `Feedback "${label}" applied to "${session.title}"`,
        meta: JSON.stringify({ update_id: u.update_id, chatId, felt }),
      },
    });
    applied++;
    results.push(`${chatId}: ${label}`);
  }

  if (applied)
    await logEvent({
      kind: "info",
      source: "cron",
      route: "/api/cron/feedback-ingest",
      message: `feedback applied=${applied}`,
    });
  return NextResponse.json({ ok: true, applied, results });
}
