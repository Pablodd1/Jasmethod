// ONE effective-prescription resolver — the single gate for Today, /daily and
// every export/publisher (Codex review P1-1, 2026-09-29: the new daily screen
// and Intervals publisher bypassed injury/rest rules that /api/today applied).
// Any surface that shows or sends a prescription MUST resolve it here.
import { prisma } from "./db";
import { prescribeToday } from "./adaptive";
import { baseWorkout } from "./prescription";

export async function effectivePrescription(
  userId: string,
  workoutId: string,
): Promise<{ workout: any; prescription: any } | null> {
  const workout = await prisma.workout.findFirst({
    where: { id: workoutId, userId },
    include: { planDay: { select: { dayOff: true } } },
  });
  if (!workout) return null;
  const profile = await prisma.athleteProfile.findUnique({ where: { userId } });
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
    !!profile?.injured;
  if (!p || rest) {
    // FALLBACK KEEPS PERSONALIZATION (Codex follow-up F1): the generated
    // prescription must see FTP/LTHR/pace anchors and the intensity override
    // exactly like Today's own path — otherwise devices get generic sessions.
    p = prescribeToday({
      session: baseWorkout(workout),
      adaptation: rest
        ? { verdict: "rest", durationFactor: 0, intensityCap: "z1" }
        : { verdict: "full", durationFactor: 1, intensityCap: "z7" },
      profile: profile ?? undefined,
    });
  }
  return { workout, prescription: p };
}
