import { automatedDeliveryEnabled } from "@/lib/capabilities";
import { claimDelivery, deliveryFailureStatus, reconcileStaleDeliveries, reminderSchedule } from "@/lib/delivery-claim";
import { trainingReminder } from "@/lib/training-reminder";
import { prisma } from "@/lib/db";
import { dayBounds, addDaysKey, localDate } from "@/lib/dates";
import { sendEmail } from "@/lib/email";
import { sendTelegram, sendTelegramPhoto } from "@/lib/notify";
import { meterUsage, logEvent } from "@/lib/telemetry";
import { buildWeeklyReview, isWeeklyReviewTime, weeklyReviewDay } from "@/lib/weekly-review";
export const dynamic = "force-dynamic";
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret)
    return Response.json({ error: "Cron is not configured" }, { status: 503 });
  if (req.headers.get("authorization") !== `Bearer ${secret}`)
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (!automatedDeliveryEnabled()) return Response.json({ enabled: false, sent: 0, reason: "Automated delivery is disabled pending delivery, consent and safety review." });
  const stale = await reconcileStaleDeliveries();
  if (stale.count) await logEvent({kind:"warn", source:"cron", route:"/api/cron/reminders", message:`${stale.count} interrupted deliveries need receipt review; not resent.`});
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
    const schedule = reminderSchedule(user.timezone, pref.reminderHour, pref.remindBeforeMin || 0);
    if (!schedule) { skipped++; continue; }
    const day = dayBounds(user.timezone), key = schedule.workoutDay;

    // WEEKLY REVIEW (Sunday evening, once/week): adherence, best effort,
    // next week's focus — the retention feature, from the athlete's own data.
    if (isWeeklyReviewTime(user.timezone, pref.reminderHour)) {
      try {
        const lang = (user.language === "es" ? "es" : "en") as "en" | "es";
        const review = await buildWeeklyReview(user.id, user.timezone, lang);
        const weekKey = weeklyReviewDay(user.timezone);
        for (const channel of [pref.telegramEnabled ? "telegram" : "email"]) {
          if (channel === "email" ? !pref.emailEnabled : !pref.telegramEnabled)
            continue;
          if (!await claimDelivery(user.id, weekKey, `${channel}:weekly`)) continue;
          const result =
            channel === "email"
              ? await sendEmail({
                  to: user.email,
                  subject: review.subject,
                  text: review.text,
                  html: `<pre style="white-space:pre-wrap;font-family:system-ui">${review.text.replace(/&/g, "&amp;").replace(/</g, "&lt;")}</pre>`,
                  userId: user.id,
                })
              : pref.telegramChatId
                ? await sendTelegram(pref.telegramChatId, review.text)
                : { ok: false, error: "Telegram chat is not configured" };
          await prisma.reminderDelivery.update({
            where: {
              userId_day_channel: { userId: user.id, day: weekKey, channel: `${channel}:weekly` },
            },
            data: { status: result.ok ? "sent" : deliveryFailureStatus(result.error), error: result.error || null },
          }).catch(() => {});
          if (result.ok) {
            sent++;
            await meterUsage(user.id, channel === "email" ? "email_sends" : "telegram_msgs", 1);
          } else failed++;
        }
      } catch (reviewErr) {
        console.error("[weekly review] failed:", String(reviewErr).slice(0, 140));
      }
    }

    const { text, subject, html, png } = await trainingReminder(user, key);
    for (const channel of [pref.telegramEnabled ? "telegram" : "email"]) {
      if (channel === "email" ? !pref.emailEnabled : !pref.telegramEnabled)
        continue;
      if (!await claimDelivery(user.id, schedule.claimDay, channel)) {
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
          userId_day_channel: { userId: user.id, day: schedule.claimDay, channel },
        },
        data: {
          status: result.ok ? "sent" : deliveryFailureStatus(result.error),
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

    // Feedback is collected for the selected session inside the authenticated app.

  }
  await logEvent({
    kind: "info",
    source: "cron",
    route: "/api/cron/reminders",
    message: `reminders sent=${sent} failed=${failed} skipped=${skipped}`,
  });
  return Response.json({ ok: failed === 0, sent, failed, skipped });
}
