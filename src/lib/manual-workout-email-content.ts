import { dailyEnvironmentSummary } from "./daily-environment";
import { trustedCycleMovementGuidance } from "./cycle-movement-guidance";
import { sportStepInstruction, type SportStepDetail, type SwimStroke } from "./sport-structure";
import type { CanonicalSession, CanonicalStep, ResolvedTarget, SessionSport } from "./canonical-session";
import type { SessionNutrition } from "./session-nutrition";
import type { ManualWorkoutEmailReadyPlan } from "./manual-workout-email-template";
import { manualEmailLanguage, type ManualWorkoutEmailLanguage } from "./manual-workout-email-locale";
import { renderDayPng } from "./workout-graphic";

const SPORTS_ES: Record<SessionSport, string> = {
  run: "carrera", bike: "ciclismo", swim: "natación", strength: "fuerza", mobility: "movilidad",
  recovery: "recuperación", brick: "sesión combinada", hyrox: "HYROX", boxing: "boxeo",
};
const PHASES_ES = { warmup: "calentamiento", active: "trabajo", recovery: "recuperación", cooldown: "vuelta a la calma" };
const STROKES_ES: Record<SwimStroke, string> = {
  freestyle: "libre", backstroke: "espalda", breaststroke: "braza", butterfly: "mariposa",
  drill: "ejercicio técnico", mixed: "estilos mixtos", im: "combinado individual",
};
const SOURCES_ES: Record<ResolvedTarget["source"], string> = {
  explicit: "prescripción explícita", profile_reference: "referencia del perfil", effort: "esfuerzo orientativo",
};
const FLUID_SOURCES_ES = { measured: "medido", reported: "declarado, sin verificar", estimated: "estimado" };
const HYDRATION_ES = "Bebe según la sed y las condiciones; no fuerces este volumen. Evita beber en exceso o aumentar de peso durante el ejercicio. El sodio adicional no hace seguro beber en exceso. Cuenta juntos, una sola vez, los carbohidratos de las bebidas y los geles.";
const EDUCATION_ES = "Información educativa general sobre nutrición deportiva; las restricciones alimentarias, las alergias, los efectos de los medicamentos y las necesidades clínicas requieren una valoración individual.";
const UNAVAILABLE_ES = "No hay una versión verificada en español de parte de esta orientación; consulta el plan actual. No se han deducido cantidades ni indicaciones adicionales.";
// Formatting only: retain the source number's full precision, never recompute
// a target, dose, pace, unit, or identifier while localizing its presentation.
const ES_NUMBER = new Intl.NumberFormat("es", { useGrouping: false, maximumSignificantDigits: 21 });
const numberEs = (value: number | string): string => ES_NUMBER.format(typeof value === "number" ? value : Number(value));

function targetEs(target: ResolvedTarget): string {
  const source = SOURCES_ES[target.source];
  const rpe = /^(?:[a-z]+ · )?Open effort · RPE (\d+)\/10$/.exec(target.label);
  if (target.type === "open") {
    if (target.label === "Manual transition; follow the app/manifest instructions") return `Transición manual; consulta las instrucciones de la aplicación o del manifiesto [${source}]`;
    return `Esfuerzo libre${rpe ? ` · percepción del esfuerzo ${rpe[1]}/10` : "; percepción del esfuerzo no disponible"}${target.missingReason ? "; referencia fisiológica no disponible" : ""} [${source}]`;
  }
  if (target.type === "swimStroke") return `Estilo: ${target.stroke ? STROKES_ES[target.stroke] : "no disponible"}${rpe ? ` · percepción del esfuerzo ${rpe[1]}/10` : ""} [${source}]`;
  if (target.type === "pace") {
    // Canonical numeric pace is seconds/km, but its display may be min/mile.
    // Copy only the canonical renderer's exact display; do not infer units or convert.
    const pace = /^(\d+:\d{2}(?:–\d+:\d{2})?)\/(km|mi) \(plan reference\)$/.exec(target.label);
    return pace ? `Ritmo: ${pace[1]} min/${pace[2]} (referencia del plan) [${source}]` : `Ritmo no disponible: no se ha verificado la unidad de presentación [${source}]`;
  }
  const { low, high } = target;
  if (low === undefined || high === undefined || !Number.isFinite(low) || !Number.isFinite(high)) return `Objetivo numérico no disponible [${source}]`;
  const lthr = target.type === "heartRate" && target.label === `≤${high} bpm (LTHR plan reference)`;
  const value = low === high ? numberEs(high) : low === 0 || lthr ? `≤${numberEs(high)}` : `${numberEs(low)}–${numberEs(high)}`;
  const label = target.type === "power" ? `Potencia: ${value} W` : target.type === "heartRate" ? `Frecuencia cardíaca: ${value} latidos/min` : `Velocidad: ${value} m/s`;
  const reference = lthr ? " (referencia LTHR del plan)" : target.type === "power" && target.label.endsWith(" (FTP plan reference)") ? " (referencia FTP del plan)" : "";
  return `${label}${reference} [${source}]`;
}

function sportDetailEs(detail: SportStepDetail | undefined): string {
  if (!detail) return "";
  if (detail.kind === "pool") return `${numberEs(detail.lengths)} largos × ${numberEs(detail.displayLength)} ${detail.displayUnit}; ${STROKES_ES[detail.stroke]}${detail.sendOffSeconds !== undefined ? `; salida cada ${numberEs(detail.sendOffSeconds)} s desde el inicio del intervalo (no es un descanso fijo)` : ""}.`;
  if (detail.kind === "set") return `Ejercicio (nombre original): ${detail.exerciseName}; identificador original: ${detail.exerciseId}; serie ${numberEs(detail.setNumber)}${detail.load ? `; carga ${numberEs(detail.load.value)} ${detail.load.unit}` : "; carga no indicada"}.`;
  if (detail.kind === "station") return `Estación (identificador original): ${detail.stationId}${detail.load ? `; carga ${numberEs(detail.load.value)} ${detail.load.unit}` : "; carga no indicada"}.`;
  if (detail.kind === "transition") return `Transición tras el componente (identificador original): ${detail.afterComponentId}. Consulta las instrucciones de transición en la aplicación.`;
  return detail.kind === "run" ? "Tramo de carrera." : "Descanso.";
}

function stepEs(step: CanonicalStep, index: number): string {
  const e = step.endpoint;
  const endpoint = e.type === "time" ? `${numberEs(e.seconds)} s` : e.type === "distance" ? `${numberEs(e.meters)} m` : e.type === "reps" ? `${numberEs(e.reps)} repeticiones` : "vuelta manual (botón LAP)";
  const generatedIdentity = ["rest", "set", "transition"].includes(step.sportDetail?.kind || "");
  return [`Paso ${index + 1}: ${PHASES_ES[step.phase]}`, ...(generatedIdentity ? [] : [`Nombre original: ${step.name}`]), endpoint,
    `Zona ${step.zone.toUpperCase()}`, targetEs(step.target), ...(step.componentSport ? [`Componente: ${SPORTS_ES[step.componentSport]}`] : []), sportDetailEs(step.sportDetail), trustedCycleMovementGuidance(step, "es")].filter(Boolean).join(" · ");
}

// Nutrition is authored from known engine branches. These exact-template
// adapters copy source quantities, not health history, and fail visibly closed
// if the source engine changes. Never translate arbitrary saved/free-text notes.
function beforeEs(nutrition: NonNullable<SessionNutrition>): string[] {
  const pre = nutrition.fuel.preSession;
  if (pre.note === "Short/easy session — normal meal timing is enough; no extra pre-fuel." && pre.carbsG === 0) return ["Sesión corta o suave: basta con el horario habitual de las comidas; no hace falta alimentación adicional antes de entrenar."];
  if (pre.note === "Current weight is unknown, so no weight-based total is available. Choose a familiar carbohydrate-containing meal that fits your usual timing and tolerance." && pre.carbsG === null) return ["No se conoce el peso actual, por lo que no hay una cantidad total basada en el peso. Elige una comida conocida que contenga carbohidratos y se ajuste a tu horario y tolerancia habituales."];
  const match = /^(\d+) g carbs \(2 g\/kg\) 2-3 h out, or (\d+) g \(1 g\/kg\) in the last hour if time is short\. Low fiber, low fat, familiar\.$/.exec(pre.note);
  if (match && Number(match[1]) === pre.carbsG) return [`${match[1]} g de carbohidratos (2 g/kg) entre 2 y 3 h antes, o ${match[2]} g (1 g/kg) en la última hora si queda poco tiempo. Elige alimentos conocidos, bajos en fibra y grasa.`];
  return [UNAVAILABLE_ES];
}

type NoteRule = readonly [RegExp, (match: RegExpExecArray) => string];
const DURING_RULES: readonly NoteRule[] = [
  [/^Under 45 min — extra carbohydrate during the session is usually unnecessary; ordinary meals still matter\./, () => "Menos de 45 min: normalmente no hacen falta carbohidratos adicionales durante la sesión; las comidas habituales siguen siendo importantes."],
  [/^45-75 min — carbohydrates are for the mouth and brain: rinse or small sips\./, () => "Entre 45 y 75 min: los carbohidratos pueden usarse mediante enjuagues bucales o pequeños sorbos, con un efecto oral y cerebral."],
  [/^(\d+(?:\.\d+)?(?:e[+-]?\d+)?) g\/h is a general example within the 30–60 g\/h range; choose familiar food or drink and adjust for tolerance\./, m => `${numberEs(m[1])} g/h es un ejemplo general dentro del intervalo de 30–60 g/h; elige alimentos o bebidas conocidos y ajusta según tu tolerancia.`],
  [/^(\d+(?:\.\d+)?(?:e[+-]?\d+)?) g\/h total carbohydrate using a practiced glucose\/maltodextrin plus fructose mixture; ratio depends on the product and tolerance\./, m => `${numberEs(m[1])} g/h de carbohidratos totales mediante una mezcla de glucosa o maltodextrina con fructosa que ya hayas practicado; la proporción depende del producto y de la tolerancia.`],
  [/^(\d+(?:\.\d+)?(?:e[+-]?\d+)?) g\/h TOTAL carbohydrate from all foods, drinks and gels combined\./, m => `${numberEs(m[1])} g/h de carbohidratos TOTALES sumando todos los alimentos, bebidas y geles.`],
  [/^Fluid example (\d+) ml\/h \((derived from supplied measurement; applies only to similar conditions|unverified estimate, not measured need)\)\. Drink according to thirst and conditions; do not force this volume\. Avoid overdrinking or gaining body weight during exercise\. Extra sodium does not make overdrinking safe\. Count carbohydrate from drinks and gels together, once\./, m => `Ejemplo de líquidos: ${m[1]} ml/h (${m[2].startsWith("derived") ? "derivado de la medición aportada; solo se aplica a condiciones similares" : "estimación sin verificar, no una necesidad medida"}).`],
  [/^Sodium ~(\d+) mg\/h \((reported concentration, not validated replacement need|general example)\)\./, m => `Sodio: aproximadamente ${m[1]} mg/h (${m[2] === "general example" ? "ejemplo general" : "concentración declarada; no es una necesidad de reposición validada"}).`],
  [/^Recovery day: eat regular balanced meals and enough energy for recovery; this is not a weight-loss plan\./, () => "Día de recuperación: come de forma regular y equilibrada, con energía suficiente para recuperarte; este no es un plan para perder peso."],
  [/^Trimmed session — fuel stays proportional; no extra loading needed\./, () => "Sesión reducida: la alimentación se mantiene proporcional; no hace falta una carga adicional."],
  [/^Optional caffeine example (\d+) mg, requested explicitly\. Consider all sources and usual tolerance; seek qualified advice for medication\/condition-dependent use\./, m => `Ejemplo opcional de cafeína: ${m[1]} mg, solicitado explícitamente. Ten en cuenta todas las fuentes y tu tolerancia habitual; consulta con un profesional cualificado si su uso depende de medicamentos o problemas de salud.`],
  [/^General sports-nutrition education; dietary restrictions, allergies, medication effects and clinical needs require individual review\./, () => ""],
];

function duringEs(nutrition: NonNullable<SessionNutrition>): string[] {
  const fuel = nutrition.fuel;
  const result = [`Ejemplo general para planificar: ${numberEs(fuel.carbsPerHourG)} g de carbohidratos TOTALES/hora; ${numberEs(fuel.fluidMlPerHour)} ml de líquidos/hora (${FLUID_SOURCES_ES[fuel.fluidSource]}); ${numberEs(fuel.sodiumMgPerHour)} mg de sodio/hora.`];
  let rest = fuel.notes;
  while (rest) {
    const rule = DURING_RULES.map(([pattern, render]) => ({ match: pattern.exec(rest), render })).find(item => item.match);
    if (!rule?.match) { result.push(UNAVAILABLE_ES); break; }
    const rendered = rule.render(rule.match);
    if (rendered) result.push(rendered);
    rest = rest.slice(rule.match[0].length).trimStart();
  }
  result.push(HYDRATION_ES, EDUCATION_ES);
  if (fuel.carbsPerHourG > 60) result.push("Una ingesta mayor de carbohidratos requiere práctica previa con buena tolerancia. Por encima de 90 g/h hace falta una valoración individual y ensayos previos; nunca lo intentes por primera vez el día de la competición.");
  return result;
}

function afterEs(nutrition: NonNullable<SessionNutrition>): string[] {
  const post = nutrition.post;
  if (post.note === "Current weight is unknown, so weight-based totals are unavailable. Have a familiar meal or snack containing carbohydrate and protein, and drink according to thirst. Next-session timing, dietary needs and measured losses can change recovery needs; do not force fluids." && post.carbsG === null && post.proteinG === null) return ["No se conoce el peso actual, por lo que no hay cantidades totales basadas en el peso. Toma una comida o un tentempié conocido que contenga carbohidratos y proteínas, y bebe según la sed. El horario de la próxima sesión, las necesidades alimentarias y las pérdidas medidas pueden cambiar las necesidades de recuperación; no fuerces la ingesta de líquidos."];
  const rapid = /^Short recovery before the next session: rapid glycogen restoration may use approximately (\d+)–(\d+) g carbohydrate PER HOUR \(1\.0–1\.2 g\/kg\/h\), split into tolerated feedings during the available recovery period\. This is not a four-hour total\. Include familiar protein-containing food; individual dietary needs and GI tolerance matter\.$/.exec(post.note);
  if (rapid) return [`Recuperación breve antes de la próxima sesión: la reposición rápida de glucógeno puede utilizar aproximadamente ${rapid[1]}–${rapid[2]} g de carbohidratos POR HORA (1,0–1,2 g/kg/h), repartidos en tomas toleradas durante el tiempo de recuperación disponible. No es el total para cuatro horas. Incluye alimentos conocidos con proteínas; las necesidades alimentarias individuales y la tolerancia gastrointestinal importan.`];
  const meal = /^A recovery meal or snack example is (\d+) g carbohydrate and (\d+) g protein\. These are one feeding's approximate amounts, not a mandatory ratio or four-hour total\. Ordinary meals can meet recovery needs; rapid hourly refuelling depends on a short turnaround, which is not assumed\. Drink to thirst and replace measured losses gradually; avoid overdrinking\.$/.exec(post.note);
  if (meal && Number(meal[1]) === post.carbsG && Number(meal[2]) === post.proteinG) return [`Un ejemplo de comida o tentempié de recuperación contiene ${meal[1]} g de carbohidratos y ${meal[2]} g de proteínas. Son cantidades aproximadas para una sola toma, no una proporción obligatoria ni el total para cuatro horas. Las comidas habituales pueden cubrir la recuperación; la reposición rápida por horas depende de un intervalo breve entre sesiones, que no se da por supuesto. Bebe según la sed y repón gradualmente las pérdidas medidas; evita beber en exceso.`];
  return [UNAVAILABLE_ES];
}

const GAPS_ES: Record<string, string> = {
  "Current weight not supplied; weight-based pre/post totals unavailable.": "No se ha indicado el peso actual; no hay cantidades totales previas o posteriores basadas en el peso.",
  "Sweat rate is athlete-reported; measurement date/conditions are unverified.": "La tasa de sudoración es declarada por el deportista; no se han verificado la fecha ni las condiciones de la medición.",
  "Sweat rate unknown; fluid quantity is a general example, not your measured need.": "Se desconoce la tasa de sudoración; la cantidad de líquidos es un ejemplo general, no tu necesidad medida.",
  "Sweat sodium unknown; sodium quantity is a general example, not measured loss.": "Se desconoce el sodio del sudor; la cantidad de sodio es un ejemplo general, no una pérdida medida.",
  "Saved nutrition context is invalid. Review and save it again; advanced guidance is unavailable.": "El contexto nutricional guardado no es válido. Revísalo y guárdalo de nuevo; la orientación avanzada no está disponible.",
  "Session timezone or current date is invalid; advanced nutrition context is unavailable.": "La zona horaria de la sesión o la fecha actual no es válida; el contexto nutricional avanzado no está disponible.",
  "Dated nutrition practice and measurement context are not recorded; higher intake and short turnaround are not inferred.": "No se han registrado prácticas nutricionales y mediciones con fecha y contexto; no se deducen una ingesta mayor ni un intervalo breve entre sesiones.",
  "Advanced nutrition context applies only to the matching current, ready session.": "El contexto nutricional avanzado solo se aplica a la sesión actual que corresponda y esté lista.",
  "Session context is invalid; advanced nutrition guidance is unavailable.": "El contexto de la sesión no es válido; la orientación nutricional avanzada no está disponible.",
  "Current conditions are missing or do not explicitly match the practice observation. Guidance is capped at 60 g/h or the lower recorded tolerance/target; higher intake is unavailable.": "Faltan las condiciones actuales o no coinciden explícitamente con la práctica registrada. La orientación tiene un límite de 60 g/h o la menor tolerancia u objetivo registrado; una ingesta superior no está disponible.",
  "Intake above 90 g/h is unavailable in this workflow. The recorded reviewed-high-intake flag is self-reported and does not verify qualified individualized review.": "La ingesta superior a 90 g/h no está disponible en este proceso. La indicación guardada de revisión de una ingesta elevada es autodeclarada y no acredita una valoración individual por un profesional cualificado.",
  "Dated carbohydrate practice is missing; a gut-training checkbox does not establish a dose.": "Falta un registro fechado de práctica con carbohidratos; marcar una casilla de entrenamiento intestinal no establece una dosis.",
  "Sweat measurement describes the supplied conditions; confirm they are representative. It does not establish a compulsory fluid-replacement volume.": "La medición del sudor describe las condiciones aportadas; confirma que sean representativas. No establece un volumen obligatorio de reposición de líquidos.",
  "The saved turnaround belongs to a different session or timing. Review it after schedule or duration changes; a short recovery interval is not assumed.": "El intervalo entre sesiones guardado corresponde a otra sesión u horario. Revísalo si cambian el horario o la duración; no se da por supuesto un intervalo breve de recuperación.",
};
function gapEs(gap: string): string {
  if (Object.prototype.hasOwnProperty.call(GAPS_ES, gap)) return GAPS_ES[gap];
  const practice = /^Review carbohydrate practice: it must match sport, intensity and duration, have no known conditions conflict, and be within (\d+) days under JMM review policy\. This is an app review policy, not a biological threshold\.$/.exec(gap);
  if (practice) return `Revisa la práctica con carbohidratos: debe coincidir en deporte, intensidad y duración, no tener conflictos conocidos de condiciones y estar dentro de los ${practice[1]} días establecidos por la política de revisión de JMM. Es una política de revisión de la aplicación, no un umbral biológico.`;
  const sweat = /^Sweat rate remains reported: review measurement value, sport, intensity, conditions and the (\d+)-day JMM review policy before treating it as measured in comparable conditions\.$/.exec(gap);
  if (sweat) return `La tasa de sudoración sigue siendo un dato declarado: revisa el valor medido, el deporte, la intensidad, las condiciones y la política de revisión de ${sweat[1]} días de JMM antes de considerarla una medición en condiciones comparables.`;
  return "Hay una limitación adicional cuya versión verificada en español no está disponible; consulta el plan actual antes de usar esta orientación.";
}

/** Canonical values only; never infer HR, VO2max, power or calories from zones. */
export function manualWorkoutEmailContent(session: CanonicalSession, nutrition: SessionNutrition, startTime: string | null, includeGraphic = true, language: ManualWorkoutEmailLanguage = "en"): { plan: ManualWorkoutEmailReadyPlan; graphic: Buffer | null } {
  if (!manualEmailLanguage(language)) throw Error("Manual workout email language is unavailable");
  if (session.verdict !== "ready") throw Error("Only a ready canonical session can include instructions");
  const es = language === "es";
  const steps = session.steps.map((s, index) => {
    if (es) return stepEs(s, index);
    const e = s.endpoint;
    const end = e.type === "time" ? `${e.seconds} s` : e.type === "distance" ? `${e.meters} m` : e.type === "reps" ? `${e.reps} reps` : "manual lap";
    return `${s.phase}: ${s.name} · ${end} · ${s.zone.toUpperCase()} · ${s.target.label} [${s.target.source}]${s.sportDetail ? ` · ${sportStepInstruction(s.sportDetail)}` : ""}${trustedCycleMovementGuidance(s) ? ` · ${trustedCycleMovementGuidance(s)}` : ""}`;
  });
  const timed = session.steps.length > 0 && session.steps.every(s => s.endpoint.type === "time");
  const graphic = timed && includeGraphic ? renderDayPng([session.steps.map(s => ({ name: s.name, seconds: s.endpoint.type === "time" ? s.endpoint.seconds : 0, zone: s.zone, phase: s.phase }))]) : null;
  const fuel = nutrition?.fuel;
  if (es) {
    const statuses = { missing: "sin registrar", invalid: "no válido", current: "vigente", review_required: "requiere revisión" };
    return { graphic, plan: {
      summary: `${session.dateLocal} · ${startTime || "Hora de inicio sin indicar"} (${session.timezone}) · ${SPORTS_ES[session.sport]} · ${session.exactTimeSeconds === null ? `${numberEs(session.durationMin)} min de duración planificada estimada` : `${numberEs(session.exactTimeSeconds / 60)} min de tiempo estructurado`}`,
      steps,
      before: nutrition ? beforeEs(nutrition) : ["La orientación personalizada de alimentación no está disponible; consulta el plan actual."],
      during: nutrition ? duringEs(nutrition) : ["No hay cantidades verificadas de alimentación e hidratación disponibles."],
      after: nutrition ? afterEs(nutrition) : ["La orientación nutricional de recuperación no está disponible."],
      preparation: ["Carga el dispositivo y comprueba que llevas el entrenamiento correcto, el material necesario y acceso a agua antes de salir.", session.environment ? dailyEnvironmentSummary(session.environment, "es") : "No se han verificado el tiempo ni la ubicación. Consulta las condiciones locales actuales; si hace calor, planifica sombra y medidas para refrescarte, y considera llevar una toalla u otros elementos para enfriarte cuando sea práctico.", "Opcional: haz una pausa breve y cómoda para respirar y concentrarte. Sin retener la respiración ni prometer efectos sobre el sistema nervioso autónomo."],
      limitations: [...new Set([...(fuel?.measurementGaps.map(gapEs) || []), ...(nutrition ? [`Contexto nutricional: ${statuses[nutrition.contextStatus]}. La orientación es educativa, no una necesidad medida.`] : []), "Esta exportación no ofrece un porcentaje de VO2max. La frecuencia cardíaca, el ritmo, la potencia y la energía son magnitudes distintas; utiliza solo el objetivo respaldado que se muestra en cada paso.", ...(timed ? ["La anchura de las barras del gráfico representa el tiempo prescrito; los colores identifican zonas de entrenamiento, no una respuesta fisiológica medida."] : ["No hay un gráfico a escala temporal para pasos de distancia, repeticiones o vuelta manual; utiliza la lista exacta de pasos."]), "La compatibilidad y la transferencia al dispositivo siguen sin verificarse."])],
      ...(graphic ? { graphicCid: "workout-profile@jmm", graphicAlt: steps.join("; ") } : {}),
    } };
  }
  return { graphic, plan: {
    summary: `${session.dateLocal} · ${startTime || "Start time not set"} (${session.timezone}) · ${session.sport} · ${session.exactTimeSeconds === null ? `${session.durationMin} min planned estimate` : `${session.exactTimeSeconds / 60} min structured time`}`,
    steps,
    before: fuel ? [fuel.preSession.note] : ["Personalized fueling guidance is unavailable; review the current plan."],
    during: fuel ? [`General planning example: ${fuel.carbsPerHourG} g TOTAL carbohydrate/hour; ${fuel.fluidMlPerHour} ml fluid/hour (${fuel.fluidSource}); ${fuel.sodiumMgPerHour} mg sodium/hour.`, fuel.notes, ...(fuel.carbsPerHourG > 60 ? ["Higher carbohydrate intake requires previously tolerated practice. Above 90 g/h requires individualized review and rehearsal; never make a first attempt on race day."] : [])] : ["No verified fueling quantities are available."],
    after: nutrition ? [nutrition.post.note] : ["Recovery nutrition guidance is unavailable."],
    preparation: ["Charge your device and check the correct workout, equipment and water access before leaving.", session.environment ? dailyEnvironmentSummary(session.environment, "en") : "Weather and location are not verified here. Check current local conditions; in heat, plan shade/cooling and consider a towel or cooling supplies when practical.", "Optional: take a brief, comfortable breathing pause to focus. No breath holds or promised autonomic effect."],
    limitations: [...new Set([...(fuel?.measurementGaps || []), ...(nutrition ? [`Nutrition context: ${nutrition.contextStatus}. Guidance is educational, not a measured requirement.`] : []), "No VO2max percentage is available from this export. Heart rate, pace, power and energy are different quantities; use only the supported target shown for each step.", ...(timed ? ["Graphic widths show prescribed time; colors identify workout zones, not measured physiological response."] : ["A time-scaled graphic is unavailable for distance, repetition or manual-lap steps; use the exact step list."]), "Compatibility and transfer to your device remain unverified."])] ,
    ...(graphic ? { graphicCid: "workout-profile@jmm", graphicAlt: steps.join("; ") } : {}),
  } };
}

/** Explicitly consented calendar details only. No free-text notes or safety answers. */
export function manualWorkoutCalendarDescription(session: CanonicalSession, nutrition: SessionNutrition, startTime: string | null, language: ManualWorkoutEmailLanguage = "en") {
  const { plan } = manualWorkoutEmailContent(session, nutrition, startTime, false, language);
  return language === "es"
    ? [plan.summary, "Entrenamiento (referencias del plan actual):", ...plan.steps, "Preparación:", ...plan.preparation,
      "Antes:", ...plan.before, "Durante:", ...plan.during, "Después:", ...plan.after, "Limitaciones:", ...plan.limitations,
      "Resumen solo en texto. El gráfico del entrenamiento y el último archivo aprobado están en la aplicación, tras iniciar sesión."].join("\n")
    : [plan.summary, "Workout (current plan references):", ...plan.steps, "Preparation:", ...plan.preparation,
      "Before:", ...plan.before, "During:", ...plan.during, "After:", ...plan.after, "Limits:", ...plan.limitations,
      "Plain-text summary only. The workout graphic and latest approved file are in the authenticated app."].join("\n");
}
