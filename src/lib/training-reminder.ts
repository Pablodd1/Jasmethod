import { prisma } from "./db";
import { localDate, addDaysKey } from "./dates";
import { prescribeToday } from "./adaptive";
import { baseWorkout } from "./prescription";
import { buildFuelingPlan, postFuelPersonalized } from "./fueling";
import {
  telegramPlan,
  gmailPlanHtml,
  calendarDescription,
  type PlanFormatSession,
} from "./plan-formats";
export async function trainingReminder(
  user: { id: string; name: string; timezone: string; profile?: any },
  key: string,
) {
  const sessions = await prisma.workout.findMany({
    where: {
      userId: user.id,
      planned: true,
      completed: false,
      date: {
        gte: localDate(key, user.timezone),
        lt: localDate(addDaysKey(key, 1), user.timezone),
      },
    },
    include: { planDay: true },
    orderBy: { startTime: "asc" },
  });

  const fmt: PlanFormatSession[] = [];
  const detailLines: string[][] = [];
  for (const w of sessions) {
    if (
      user.profile?.injured ||
      w.planDay?.dayOff ||
      w.feedbackStatus === "skipped"
    )
      continue;
    const p = w.prescription
      ? JSON.parse(w.prescription)
      : prescribeToday({
          session: baseWorkout(w),
          adaptation: {
            verdict: "full",
            durationFactor: 1,
            intensityCap: "z7",
          },
          profile: user.profile,
        });
    // Fuel plan matched to THIS session (duration + intensity + the
    // athlete's weight/sweat data): pre, during, post.
    const fuel = buildFuelingPlan({
      durationMin: p.durationMin,
      intensity: p.intensity,
      weightKg: user.profile?.weightKg,
      sweatRateMlH: user.profile?.sweatRateMlH,
      sodiumMgPerL: user.profile?.sodiumMgPerL,
      gutTrained: user.profile?.gutTrained,
      verdict: p.verdict,
    });
    const post = p.durationMin > 0
      ? postFuelPersonalized({
          durationMin: p.durationMin,
          intensity: p.intensity,
          sport: p.sport,
          weightKg: user.profile?.weightKg,
        })
      : null;
    fmt.push({
      title: p.title,
      sport: p.sport ?? baseWorkout(w).sport,
      durationMin: p.durationMin,
      intensity: p.intensity,
      startTime: w.startTime ?? null,
      steps: (p.steps || []).map((s: any) => ({
        name: s.name,
        seconds: s.seconds,
        reps: s.reps,
        zone: s.zone,
        note: s.note,
      })),
      fuel,
      post,
    });
    const lines = [
      `${p.title}: ${p.durationMin} min`,
      ...p.steps.map(
        (s: any) => `${s.name}: ${s.reps ? `${s.reps} reps` : `${s.seconds / 60} min`}${s.target?.type === "open" ? "" : `, ${s.zone.toUpperCase()}`}`,
      ),
    ];
    // Full fuel detail stays in the per-session detail (the creative plan
    // shows the summary).
    const fuelLines: string[] = [];
    if (fuel.preSession?.carbsG > 0)
      fuelLines.push(`pre: ${fuel.preSession.carbsG}g carbs ${fuel.preSession.timingLabel}`);
    if (fuel.carbsPerHourG > 0 || fuel.fluidMlPerHour > 0)
      fuelLines.push(
        `during: ${fuel.carbsPerHourG}g carbs/h + ${fuel.fluidMlPerHour}ml/h${fuel.sodiumMgPerHour ? ` + ${fuel.sodiumMgPerHour}mg sodium/h` : ""}`,
      );
    if (p.durationMin > 0 && post)
      fuelLines.push(`post: ${post.carbsG}g carbs + ${post.proteinG}g protein`);
    if (fuelLines.length) lines.push(`⛽ Fuel — ${fuelLines.join(" · ")}`);
    detailLines.push(lines);
  }

  const dayLabel = key;
  // Creative skins: emoji-dense chat plan (Telegram + fallback text) and a
  // styled Gmail HTML card with the full detail collapsible underneath.
  const text = telegramPlan(user.name, dayLabel, fmt);
  const gmail = gmailPlanHtml(user.name, dayLabel, fmt);
  const subject = `Jasmethod — ${key}`;
  const html = detailLines.length
    ? `<div style="font-family:system-ui;max-width:600px;margin:auto">
  ${gmail.html}
  <details style="margin-top:12px">
    <summary style="font-size:12px;color:#64748b">Full session detail (per-step)</summary>
    <pre style="white-space:pre-wrap;font-size:12px;color:#334155;background:#f1f5f9;padding:12px;border-radius:8px">${detailLines.map((l) => l.join("\n")).join("\n\n").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")}</pre>
  </details>
</div>`
    : gmail.html;
  return { text, subject, html, calendarDescriptions: fmt.map(calendarDescription) };
}
