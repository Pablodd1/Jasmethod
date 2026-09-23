import { trainingReminder } from "@/lib/training-reminder";
import { prisma } from "@/lib/db";
import { dayBounds, addDaysKey, localDate } from "@/lib/dates";
import { sendEmail } from "@/lib/email";
import { sendTelegram, sendTelegramPhoto } from "@/lib/notify";
import { meterUsage, logEvent } from "@/lib/telemetry";
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
    include: { reminder: true, profile: true, supplement: true },
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
    // CATCH-UP semantics: deliver at the first cron hour at-or-after the
    // user's chosen hour (the per-day+channel claim below dedupes). Exact-hour
    // matching made delivery silently skip whenever Vercel missed an hour or
    // the plan capped the schedule below hourly.
    if (hour < pref.reminderHour) {
      skipped++;
      continue;
    }
    const day = dayBounds(user.timezone),
      key = pref.reminderHour >= 12 ? addDaysKey(day.key, 1) : day.key;
    const { text, subject, html, png } = await trainingReminder(user, key);
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
              ...(png
                ? {
                    attachments: [
                      { filename: "todays-shape.png", content: png, cid: "workout-shape" },
                    ],
                  }
                : {}),
            })
          : pref.telegramChatId
            ? await (async () => {
                // The red trail rides as a photo above the full plan text.
                let first: { ok: boolean; error?: string } = { ok: true };
                if (png) {
                  first = await sendTelegramPhoto(
                    pref.telegramChatId!,
                    png,
                    `📈 ${user.name} — ${key} · effort shape`,
                  );
                }
                const plan = await sendTelegram(pref.telegramChatId!, text);
                return {
                  ok: first.ok && plan.ok,
                  error: plan.error || first.error,
                };
              })()
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
      if (result.ok) {
        sent++;
        await meterUsage(user.id, channel === "email" ? "email_sends" : "telegram_msgs", 1);
      } else {
        failed++;
        await logEvent({
          kind: "error",
          source: "cron",
          route: "/api/cron/reminders:" + channel,
          userId: user.id,
          message: result.error || "delivery failed",
        });
      }
    }
  }
  await logEvent({
    kind: "info",
    source: "cron",
    route: "/api/cron/reminders",
    message: `reminders sent=${sent} failed=${failed} skipped=${skipped}`,
  });
  return Response.json({ ok: failed === 0, sent, failed, skipped });
}
