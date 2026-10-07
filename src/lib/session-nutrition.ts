import { buildFuelingPlan, postFuelPersonalized } from './fueling';
import { nutritionContextForSession, type NutritionSession } from './nutrition-context';
import type { TargetProfile } from './canonical-session';

// All runtime consumers share these exact numbers and units, based on the same
// profile and effective-session snapshot as the canonical revision.
export function buildSessionNutrition(profile: TargetProfile | null | undefined, session: NutritionSession, now = new Date()) {
  if (session.verdict !== 'ready' || session.durationMin <= 0) return null;
  const context = nutritionContextForSession(profile, session, now);
  const fuel = buildFuelingPlan({ durationMin: session.durationMin, intensity: session.intensity,
    weightKg: profile?.weightKg, sweatRateMlH: profile?.sweatRateMlH, sodiumMgPerL: profile?.sodiumMgPerL,
    ...context.fueling });
  const post = postFuelPersonalized({durationMin:session.durationMin,intensity:session.intensity,sport:session.sport,
    weightKg:profile?.weightKg,nextSessionInHours:context.nextSessionInHours});
  fuel.measurementGaps.push(...context.reviewReasons);
  return { fuel, post, intensity: session.intensity, contextStatus: context.status, reviewReasons: context.reviewReasons };
}
export type SessionNutrition = ReturnType<typeof buildSessionNutrition>;
