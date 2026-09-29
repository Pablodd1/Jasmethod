// ONE effective-prescription resolver — the single gate for Today, /daily and
// every export/publisher (Codex review P1-1, 2026-09-29: the new daily screen
// and Intervals publisher bypassed injury/rest rules that /api/today applied).
// Any surface that shows or sends a prescription MUST resolve it here.
import { prisma } from "./db";
import { prescribeToday } from "./adaptive";
import { baseWorkout } from "./prescription";
import { structuredSteps } from "./prescription";

export async function effectivePrescription(
  userId: string,
  workoutId: string,
): Promise<{ workout: any; prescription: any } | null> {
  const workout = await prisma.workout.findFirst({
    where: { id: workoutId, userId },
    include: { planDay: { select: { dayOff: true } } },
  });
  if (!workout) return null;
  let p: any = null;
  try {
    p = workout.prescription ? JSON.parse(workout.prescription) : null;
  } catch {}
  // Safety gate — identical to /api/today: an injured athlete or a day-off
  // row is rest, no matter what the stored prescription says. A stale saved
  // prescription must never reach the screen or a device.
  const rest =
    !!workout.planDay?.dayOff ||
    workout.durationMin === 0 ||
    !!(await prisma.athleteProfile.findUnique({
      where: { userId },
      select: { injured: true },
    }))?.injured;
  if (!p || rest) {
    p = prescribeToday({
      session: baseWorkout(workout),
      adaptation: rest
        ? { verdict: "rest", durationFactor: 0, intensityCap: "z1" }
        : { verdict: "full", durationFactor: 1, intensityCap: "z7" },
    });
  }
  return { workout, prescription: p };
}
