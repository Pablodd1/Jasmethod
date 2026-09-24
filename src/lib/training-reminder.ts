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
import { renderDayPng, type GraphicStep } from "./workout-graphic";
import { dayOffProtocolText } from "./day-off";
import { caffeineAllowedFromPrefs } from "./fueling";
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
  let hasDayOff = false;
  for (const w of sessions) {
    if (
      user.profile?.injured ||
      w.planDay?.dayOff ||
      w.feedbackStatus === "skipped"
    ) {
      if (w.planDay?.dayOff) hasDayOff = true;
      continue;
    }
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
    // athlete's weight/sweat data): pre, during, post. Caffeine honors
    // the supplement opt-out.
    const fuel = buildFuelingPlan({
      durationMin: p.durationMin,
      intensity: p.intensity,
      weightKg: user.profile?.weightKg,
      sweatRateMlH: user.profile?.sweatRateMlH,
      sodiumMgPerL: user.profile?.sodiumMgPerL,
      gutTrained: user.profile?.gutTrained,
      verdict: p.verdict,
    });
    if (
      !caffeineAllowedFromPrefs({
        enabled: (user as any).supplement?.enabled,
        likes: (user as any).supplement?.likes,
        dislikes: (user as any).supplement?.dislikes,
        optsOut: (user as any).supplement?.optsOut,
      })
    )
      delete (fuel as { caffeineMg?: number }).caffeineMg;
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
  const lang = (user as any).language === "es" ? "es" : "en";
  const dayOffBlock = hasDayOff ? dayOffProtocolText(lang) : "";
  // THE WHY: one plain sentence derived from the session's own adaptation
  // verdict — the athlete reads why today looks like this before anything.
  const firstVerdict = (fmt[0] as any)?.verdict;
  const whyLine = hasDayOff
    ? "Recovery day — adaptation happens on rest; sleep is the workout."
    : firstVerdict === "rest"
      ? "Full rest prescribed — your body flagged something; honor it."
      : firstVerdict === "easy" || firstVerdict === "trim"
        ? `Today is eased (${firstVerdict}) — recovery signals said protect the block.`
        : firstVerdict === "full"
          ? "Green light — your recovery supports the planned quality today."
          : null;
  const text = hasDayOff
    ? telegramPlan(user.name, dayLabel, fmt, whyLine) + (dayOffBlock ? `\n\n${dayOffBlock}` : "")
    : telegramPlan(user.name, dayLabel, fmt, whyLine);
  const gmail = gmailPlanHtml(user.name, dayLabel, fmt);
  const subject = `Jasmethod — ${key}`;

  // The red trail — the day's real effort shape, one row per session.
  // PNG for the Telegram photo + Gmail inline; signed public URLs go into
  // the calendar descriptions so the shape is one click away everywhere.
  const graphicRows: GraphicStep[][] = fmt.map((s) =>
    (s.steps || []).map((st) => ({
      name: st.name,
      seconds: st.seconds,
      zone: st.zone,
      phase: st.phase,
    })),
  );
  const png = graphicRows.length ? renderDayPng(graphicRows) : null;
  const gmailHtml = `<div style="font-family:system-ui;max-width:600px;margin:auto">
  ${gmail.html}
  ${
    graphicRows.length
      ? `<div style="margin:4px 0 12px"><img src="cid:workout-shape" alt="Today's effort shape — red bars scale with intensity" style="width:100%;max-width:600px;border-radius:8px;border:1px solid #e2e8f0"/></div>`
      : ""
  }
  ${
    detailLines.length
      ? `<details style="margin-top:12px">
    <summary style="font-size:12px;color:#64748b">Full session detail (per-step)</summary>
    <pre style="white-space:pre-wrap;font-size:12px;color:#334155;background:#f1f5f9;padding:12px;border-radius:8px">${detailLines.map((l) => l.join("\n")).join("\n\n").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")}</pre>
  </details>`
      : ""
  }
</div>`;
  return {
    text,
    subject,
    html: gmailHtml,
    calendarDescriptions: fmt.map(calendarDescription),
    png,
    pngCid: "workout-shape",
    sessions: fmt.map((s) => ({ title: s.title, sport: s.sport, durationMin: s.durationMin, intensity: s.intensity, steps: s.steps })),
  };
}
