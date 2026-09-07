import { prisma } from "./db";
import { localDate, addDaysKey } from "./dates";
import { prescribeToday } from "./adaptive";
import { baseWorkout } from "./prescription";
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
