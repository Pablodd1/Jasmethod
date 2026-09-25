import { trainingReminder } from "@/lib/training-reminder";
import { prisma } from "@/lib/db";
import { dayBounds, addDaysKey, localDate } from "@/lib/dates";
import { sendEmail } from "@/lib/email";
import { sendTelegram, sendTelegramPhoto } from "@/lib/notify";
import { meterUsage, logEvent } from "@/lib/telemetry";
import { buildWeeklyReview, isWeeklyReviewTime, weeklyReviewDay } from "@/lib/weekly-review";
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
    // LEAD TIME (user-set, whole hours): the reminder fires this many hours
    // EARLIER than the chosen hour, so it lands before the session instead of
    // after (review finding H5 — remindBeforeMin was stored but ignored).
    const leadHours = Math.min(6, Math.floor((pref.remindBeforeMin || 0) / 60));
    const effectiveHour = ((pref.reminderHour - leadHours) % 24 + 24) % 24;
    if (hour < effectiveHour) {
      skipped++;
      continue;
    }
    const day = dayBounds(user.timezone),
      key = effectiveHour >= 12 ? addDaysKey(day.key, 1) : day.key;

    // WEEKLY REVIEW (Sunday evening, once/week): adherence, best effort,
    // next week's focus — the retention feature, from the athlete's own data.
    if (isWeeklyReviewTime(user.timezone, pref.reminderHour)) {
      try {
        const lang = (user.language === "es" ? "es" : "en") as "en" | "es";
        const review = await buildWeeklyReview(user.id, user.timezone, lang);
        const weekKey = weeklyReviewDay(user.timezone);
        for (const channel of ["email", "telegram"]) {
          if (channel === "email" ? !pref.emailEnabled : !pref.telegramEnabled)
            continue;
          const claimed = await prisma.reminderDelivery.createMany({
            data: [{ userId: user.id, day: weekKey, channel: `${channel}:weekly`, status: "pending" }],
            skipDuplicates: true,
          });
          if (!claimed.count) continue;
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
            data: { status: result.ok ? "sent" : "failed", error: result.error || null },
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

    // EVENING FEEDBACK PROMPT (~20:00 local, once/day, Telegram-only): the
    // one-tap "how did it feel?" nudge — 1 easier / 2 as expected / 3 harder.
    // The reply feeds sessionFelt so tomorrow adapts even if the athlete
    // never reopens the app.
    if (
      hour >= 20 &&
      hour < 21 &&
      pref.telegramEnabled &&
      pref.telegramChatId
    ) {
      const fbKey = `feedback:${day.key}`;
      const claimed = await prisma.reminderDelivery.createMany({
        data: [{ userId: user.id, day: fbKey, channel: "telegram", status: "pending" }],
        skipDuplicates: true,
      });
      if (claimed.count) {
        const { start: dStart, end: dEnd } = dayBounds(user.timezone);
        const todaySession = await prisma.workout.findFirst({
          where: {
            userId: user.id,
            date: { gte: dStart, lt: dEnd },
            planned: true,
            completed: false,
            durationMin: { gt: 0 },
          },
          orderBy: { date: "asc" },
          select: { title: true, durationMin: true },
        });
        const prompt = todaySession
          ? `🏋️ ${todaySession.title} (${todaySession.durationMin} min) — how did it feel?\n1️⃣ Easier than expected\n2️⃣ As expected\n3️⃣ Harder than expected\n\n(Reply with a number — KCoach adapts tomorrow.)`
          : `☁️ Rest day — how does the body feel? Reply 1 (fresh) · 2 (ok) · 3 (beat up).`;
        const fb = await sendTelegram(pref.telegramChatId, prompt);
        await prisma.reminderDelivery.update({
          where: { userId_day_channel: { userId: user.id, day: fbKey, channel: "telegram" } },
          data: { status: fb.ok ? "sent" : "failed", error: fb.error || null },
        }).catch(() => {});
        if (fb.ok) await meterUsage(user.id, "telegram_msgs", 1);
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
