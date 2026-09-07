import { trainingReminder } from "@/lib/training-reminder";
import { prisma } from "@/lib/db";
import { dayBounds, addDaysKey, localDate } from "@/lib/dates";
import { sendEmail } from "@/lib/email";
import { sendTelegram } from "@/lib/notify";
import { prescribeToday } from "@/lib/adaptive";
import { baseWorkout } from "@/lib/prescription";
export const dynamic = "force-dynamic";
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret)
    return Response.json({ error: "Cron is not configured" }, { status: 503 });
  if (req.headers.get("authorization") !== `Bearer ${secret}`)
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  const users = await prisma.user.findMany({
    where: {
      reminder: { OR: [{ emailEnabled: true }, { telegramEnabled: true }] },
    },
    include: { reminder: true, profile: true },
  });
  let sent = 0,
    failed = 0,
    skipped = 0;
  for (const user of users) {
    const pref = user.reminder!;
    const hour = Number(
      new Intl.DateTimeFormat("en-US", {
        hour: "numeric",
        hourCycle: "h23",
        timeZone: user.timezone,
      }).format(new Date()),
    );
    if (hour !== pref.reminderHour) {
      skipped++;
      continue;
    }
    const day = dayBounds(user.timezone),
      key = pref.reminderHour >= 12 ? addDaysKey(day.key, 1) : day.key;
    const { text, subject, html } = await trainingReminder(user, key);
    for (const channel of ["email", "telegram"]) {
      if (channel === "email" ? !pref.emailEnabled : !pref.telegramEnabled)
        continue;
      const claimed = await prisma.reminderDelivery.createMany({
        data: [{ userId: user.id, day: day.key, channel, status: "pending" }],
        skipDuplicates: true,
      });
      if (!claimed.count) {
        skipped++;
        continue;
      }
      const result =
        channel === "email"
          ? await sendEmail({
              to: user.email,
              subject,
              html,
              text,
              userId: user.id,
            })
          : pref.telegramChatId
            ? await sendTelegram(pref.telegramChatId, text)
            : { ok: false, error: "Telegram chat is not configured" };
      await prisma.reminderDelivery.update({
        where: {
          userId_day_channel: { userId: user.id, day: day.key, channel },
        },
        data: {
          status: result.ok ? "sent" : "failed",
          error: result.error || null,
        },
      });
      if (result.ok) sent++;
      else failed++;
    }
  }
  return Response.json({ ok: failed === 0, sent, failed, skipped });
}
