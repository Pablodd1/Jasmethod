import { prisma } from "./db";
import { localDate, addDaysKey } from "./dates";
import { prescribeToday } from "./adaptive";
import { baseWorkout } from "./prescription";
import { buildFuelingPlan, postFuelPersonalized } from "./fueling";
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
  const lines = [`${user.name} — training for ${key}`];
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
    lines.push(
      `${p.title}: ${p.durationMin} min`,
      ...p.steps.map(
        (s: any) => `${s.name}: ${s.reps ? `${s.reps} reps` : `${s.seconds / 60} min`}${s.target?.type === "open" ? "" : `, ${s.zone.toUpperCase()}`}`,
      ),
    );
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
    const post = postFuelPersonalized({
      durationMin: p.durationMin,
      intensity: p.intensity,
      sport: p.sport,
      weightKg: user.profile?.weightKg,
    });
    const fuelLines: string[] = [];
    if (fuel.preSession?.carbsG > 0)
      fuelLines.push(`pre: ${fuel.preSession.carbsG}g carbs ${fuel.preSession.timingLabel}`);
    if (fuel.carbsPerHourG > 0 || fuel.fluidMlPerHour > 0)
      fuelLines.push(
        `during: ${fuel.carbsPerHourG}g carbs/h + ${fuel.fluidMlPerHour}ml/h${fuel.sodiumMgPerHour ? ` + ${fuel.sodiumMgPerHour}mg sodium/h` : ""}`,
      );
    if (p.durationMin > 0)
      fuelLines.push(`post: ${post.carbsG}g carbs + ${post.proteinG}g protein`);
    if (fuelLines.length) lines.push(`⛽ Fuel — ${fuelLines.join(" · ")}`);
  }
  if (lines.length === 1)
    lines.push(
      "No workout is prescribed. Rest and review your plan when ready.",
    );
  lines.push(
    "Open Today for the latest plan and complete your check-in before training.",
  );
  const text = lines.join("\n");
  return {
    text,
    subject: `Jasmethod — ${key}`,
    html: `<pre>${text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")}</pre>`,
  };
}
