import { buildFuelingPlan, postFuelPersonalized } from './fueling';
import { nutritionContextForSession, type NutritionSession } from './nutrition-context';
import type { TargetProfile } from './canonical-session';

const duringBySport: Record<string, {en:string;es:string}> = {
  swim: {en:"Keep a familiar drink poolside and use scheduled breaks. For open water, follow the event’s permitted feeding plan.",es:"Deja una bebida conocida al borde de la piscina y usa las pausas. En aguas abiertas, sigue las reglas de avituallamiento del evento."},
  bike: {en:"Plan bottle access and refills. Take familiar fuel when you can handle the bike safely.",es:"Planifica el acceso a los bidones y sus recargas. Toma alimentos conocidos cuando puedas manejar la bici con seguridad."},
  run: {en:"Plan what to carry or where to refill. Practice taking small portions at the effort you plan to run.",es:"Planifica qué llevar o dónde recargar. Practica tomar porciones pequeñas al esfuerzo previsto de carrera."},
  brick: {en:"Plan most feeding opportunities on the bike if tolerated. Rehearse what you can carry and tolerate on the run after the bike.",es:"Planifica la mayoría de las tomas en la bici si las toleras. Ensaya qué llevar y qué toleras al correr después."},
  hyrox: {en:"Use permitted breaks for fluids or practiced fuel. Rehearse timing before combining running and stations.",es:"Usa las pausas permitidas para beber o tomar alimentos practicados. Ensaya los tiempos antes de combinar carrera y estaciones."},
  strength: {en:"Keep water accessible between sets. Fit any planned fuel into longer breaks and use familiar foods.",es:"Ten agua a mano entre series. Usa pausas largas y alimentos conocidos si planificas alguna toma."},
  boxing: {en:"Use permitted breaks to drink. Practice any planned fuel timing around rounds.",es:"Usa las pausas permitidas para beber. Practica cuándo tomar alimentos entre asaltos."},
};
const generalDuring = {en:"Plan access to fluids and use familiar fuel if the session calls for it.",es:"Planifica el acceso a líquidos y usa alimentos conocidos si la sesión lo requiere."};

// All runtime consumers share these exact numbers and units, based on the same
// profile and effective-session snapshot as the canonical revision.
export function buildSessionNutrition(profile: TargetProfile | null | undefined, session: NutritionSession & {revision?:string}, now = new Date()) {
  if (session.verdict !== 'ready' || session.durationMin <= 0) return null;
  const context = nutritionContextForSession(profile, session, now);
  const fuel = buildFuelingPlan({ durationMin: session.durationMin, intensity: session.intensity,
    weightKg: profile?.weightKg, sweatRateMlH: profile?.sweatRateMlH, sodiumMgPerL: profile?.sodiumMgPerL,
    ...context.fueling });
  const post = postFuelPersonalized({durationMin:session.durationMin,intensity:session.intensity,sport:session.sport,
    weightKg:profile?.weightKg,nextSessionInHours:context.nextSessionInHours});
  const duringGuidance = session.durationMin >= 45 ? duringBySport[session.sport] ?? generalDuring : null;
  fuel.measurementGaps.push(...context.reviewReasons);
  return { schemaVersion:"session-nutrition-v1" as const,sessionId:session.id,sourceRevision:session.revision??null,dateLocal:session.dateLocal, fuel, post, duringGuidance, intensity: session.intensity, contextStatus: context.status, reviewReasons: context.reviewReasons };
}
type CurrentNutrition = NonNullable<ReturnType<typeof buildSessionNutrition>>;
export type SessionNutrition = (Omit<CurrentNutrition,"duringGuidance"> & Partial<Pick<CurrentNutrition,"duringGuidance">>) | null;
