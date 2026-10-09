import test from "node:test";
import assert from "node:assert/strict";
import { canonicalSession, type CanonicalSession, type CanonicalStep, type TargetProfile } from "./canonical-session";
import { buildFuelingPlan, postFuelPersonalized, type FuelingInput } from "./fueling";
import { buildSessionNutrition, type SessionNutrition } from "./session-nutrition";
import { manualEmailLanguage } from "./manual-workout-email-locale";
import { manualWorkoutCalendarDescription, manualWorkoutEmailContent } from "./manual-workout-email-content";

const now = new Date("2026-10-07T12:00:00Z");
function session(sport = "bike", profile: TargetProfile = {}, steps?: unknown[]): CanonicalSession {
  return canonicalSession({ athleteId: "athlete", workout: { id: "session", sport, title: "PRIVATE_TITLE", durationMin: 90 },
    prescription: { sport, durationMin: 90, steps: steps || [{ name: "Steady effort", phase: "active", zone: "z2", seconds: 5400 }] },
    profile, dateLocal: "2026-10-07", timezone: "UTC" });
}
function nutrition(input: Partial<FuelingInput> = {}, recovery: { nextSessionInHours?: number | null; sport?: string } = {}): NonNullable<SessionNutrition> {
  const opts = { durationMin: 90, intensity: "z2", weightKg: 70, ...input };
  return { fuel: buildFuelingPlan(opts), post: postFuelPersonalized({ ...opts, ...recovery }), intensity: opts.intensity,
    contextStatus: "missing", reviewReasons: [] };
}
const spanish = (n: SessionNutrition, s = session()) => manualWorkoutEmailContent(s, n, "08:00", false, "es").plan;

test("manual email language accepts only explicitly authored persisted locales", () => {
  for (const language of ["en", "es"]) assert.equal(manualEmailLanguage(language), language);
  for (const language of ["fr", "ht", "ru", "ES", "en-US", "", undefined, null]) {
    assert.equal(manualEmailLanguage(language), null);
    if (language !== undefined) assert.throws(() => manualWorkoutEmailContent(session(), null, null, false, language as "en"), /language is unavailable/);
  }
  assert.match(manualWorkoutEmailContent(session(), null, null, false).plan.summary, /Start time not set/);
});

test("Spanish source quantities preserve the pre-session alternatives and one-feeding recovery meaning", () => {
  const n = nutrition();
  const plan = spanish(n);
  assert.match(plan.before.join(" "), /140 g de carbohidratos \(2 g\/kg\).*2 y 3 h antes.*70 g \(1 g\/kg\)/);
  assert.match(plan.after.join(" "), /84 g de carbohidratos y 21 g de proteínas/);
  assert.match(plan.after.join(" "), /una sola toma, no una proporción obligatoria ni el total para cuatro horas/);
  assert.doesNotMatch(plan.after.join(" "), /POR HORA/);
  assert.doesNotMatch(JSON.stringify(plan), /No hay una versión verificada|carbohydrate|fluid\/hour|Current weight|profile_reference|planned estimate/);
});

test("Spanish rapid recovery copies the existing hourly range without relabeling meal totals", () => {
  const n = nutrition({ intensity: "z4", durationMin: 180 }, { nextSessionInHours: 3 });
  const plan = spanish(n);
  assert.match(plan.after.join(" "), /70–84 g de carbohidratos POR HORA \(1,0–1,2 g\/kg\/h\)/);
  assert.match(plan.after.join(" "), /No es el total para cuatro horas/);
  assert.doesNotMatch(plan.after.join(" "), /21 g|una sola toma|PER HOUR/);
});

test("Spanish covers each current duration branch, hydration provenance and mandatory warnings", () => {
  for (const durationMin of [20, 45, 60, 90, 180]) {
    for (const input of [{}, { sweatRateMlH: 850 }, { sweatRateMlH: 850, sodiumMgPerL: 900, sweatMeasurement: { source: "measured" as const, observedAt: "2026-10-01", context: "PRIVATE_MEASUREMENT_CONTEXT" } }]) {
      const n = nutrition({ durationMin, ...input });
      const plan = spanish(n);
      const during = plan.during.join(" ");
      assert.ok(during.includes(`${n.fuel.carbsPerHourG} g de carbohidratos TOTALES/hora`));
      assert.ok(during.includes(`${n.fuel.fluidMlPerHour} ml de líquidos/hora`));
      assert.ok(during.includes(`${n.fuel.sodiumMgPerHour} mg de sodio/hora`));
      for (const warning of ["no fuerces este volumen", "Evita beber en exceso o aumentar de peso", "El sodio adicional no hace seguro", "una sola vez", "las alergias", "efectos de los medicamentos", "necesidades clínicas"]) assert.ok(during.includes(warning), warning);
      assert.doesNotMatch(JSON.stringify(plan), /No hay una versión verificada|PRIVATE_|general example|Sweat rate|weight-based|reported|estimated|derived from/);
    }
  }
});

test("Spanish copies reviewed high intake and explicitly requested caffeine only from existing engine output", () => {
  const n = nutrition({ intensity: "z4", durationMin: 180, carbohydratePractice: { toleratedGPerHour: 100, targetGPerHour: 110, giSymptoms: "none", reviewedHighIntake: true }, caffeineOptIn: true });
  const during = spanish(n).during.join(" ");
  assert.match(during, /100 g de carbohidratos TOTALES\/hora/);
  assert.match(during, /mezcla de glucosa o maltodextrina con fructosa/);
  assert.match(during, /Por encima de 90 g\/h.*valoración individual.*nunca lo intentes por primera vez/);
  assert.match(during, /cafeína: 210 mg, solicitado explícitamente/);
  assert.doesNotMatch(during, /No hay una versión verificada|GI symptoms|110|60, 80/);
  assert.doesNotMatch(spanish(nutrition()).during.join(" "), /cafeína/);
});

test("Spanish recovery-day and trimmed-session education remains present", () => {
  for (const verdict of ["easy", "rest", "trim"]) {
    const output = spanish(nutrition({ verdict })).during.join(" ");
    assert.match(output, verdict === "trim" ? /Sesión reducida/ : /no es un plan para perder peso/);
    assert.doesNotMatch(output, /No hay una versión verificada/);
  }
});

test("Spanish copies supported fractional intake without rounding it or dropping its known guidance", () => {
  for (const durationMin of [90, 180]) {
    const n = nutrition({ durationMin, carbohydratePractice: { toleratedGPerHour: 55.5, targetGPerHour: 60, giSymptoms: "none" } });
    const during = spanish(n).during.join(" ");
    assert.match(during, /55,5 g de carbohidratos TOTALES\/hora/);
    assert.match(during, /55,5 g\/h/);
    assert.doesNotMatch(during, /No hay una versión verificada/);
  }
});

test("Spanish makes missing weight, quantities and evidence explicit without inferring doses", () => {
  const s = session();
  const n = buildSessionNutrition({}, { ...s, intensity: "z2" }, now)!;
  const plan = spanish(n, s);
  assert.match(plan.before.join(" "), /No se conoce el peso actual/);
  assert.match(plan.after.join(" "), /no hay cantidades totales basadas en el peso/);
  assert.match(plan.limitations.join(" "), /No se ha indicado el peso actual/);
  assert.match(plan.limitations.join(" "), /Se desconoce la tasa de sudoración/);
  assert.match(plan.limitations.join(" "), /no se deducen una ingesta mayor/);
  assert.match(plan.limitations.join(" "), /Contexto nutricional: sin registrar/);
  assert.doesNotMatch(JSON.stringify(plan), /No hay una versión verificada|limitación adicional/);
  const absent = spanish(null);
  assert.match(absent.before.join(" "), /no está disponible/);
  assert.match(absent.during.join(" "), /No hay cantidades verificadas/);
  assert.match(absent.after.join(" "), /no está disponible/);
});

test("unknown nutrition prose stays unavailable in Spanish and never leaks free-text health details", () => {
  const n = nutrition();
  n.fuel.preSession.note = "PRIVATE_HEALTH: new unsupported pre note";
  n.fuel.notes = "PRIVATE_HEALTH: new unsupported during note";
  n.fuel.measurementGaps.push("PRIVATE_HEALTH: new unsupported gap");
  n.fuel.measurementGaps.push("toString", "__proto__");
  n.post.note = "PRIVATE_HEALTH: new unsupported recovery units";
  const plan = spanish(n);
  for (const part of [plan.before, plan.during, plan.after]) assert.match(part.join(" "), /No hay una versión verificada en español/);
  assert.match(plan.limitations.join(" "), /limitación adicional.*no está disponible/);
  assert.match(plan.during.join(" "), /El sodio adicional no hace seguro beber en exceso/);
  assert.doesNotMatch(JSON.stringify(plan), /PRIVATE_HEALTH|unsupported|one feeding/);
  assert.ok(plan.limitations.every(item => typeof item === "string"));
});

test("Spanish localized target sources and exact units cover power, HR, pace and speed", () => {
  const source = (target: Record<string, unknown>, profile: TargetProfile = {}) => spanish(null, session("run", profile, [{ name: "Original name", phase: "warmup", zone: "z2", seconds: 5400, target }])).steps[0];
  assert.match(source({ type: "power", low: 125, high: 160 }), /Paso 1: calentamiento.*Nombre original: Original name.*5400 s.*Potencia: 125–160 W.*prescripción explícita/);
  assert.match(source({ type: "heartRate", low: 120, high: 140 }), /Frecuencia cardíaca: 120–140 latidos\/min/);
  assert.match(source({ type: "speed", low: 2.5, high: 3 }), /Velocidad: 2,5–3 m\/s/);
  assert.match(source({ type: "pace", low: 240, high: 300 }), /Ritmo: 4:00–5:00 min\/km/);
  assert.match(source({ type: "pace", low: 240, high: 300 }, { units: "imperial" }), /Ritmo: 6:26–8:03 min\/mi/);
  assert.match(spanish(null, session("bike", { ftp: 200 })).steps[0], /≤150 W.*referencia FTP del plan.*referencia del perfil/);
  assert.match(spanish(null, session("run", { lthr: 180 })).steps[0], /≤160 latidos\/min.*referencia LTHR del plan/);
  assert.match(spanish(null, session()).steps[0], /percepción del esfuerzo 3\/10.*esfuerzo orientativo/);
});

test("Spanish decimal presentation keeps full source precision and original identifiers untouched", () => {
  const current = session();
  const fractional = { ...current, durationMin: 90.5, exactTimeSeconds: null, steps: [{ ...current.steps[0], name: "Original 2.5 name", endpoint: { type: "distance" as const, meters: 1609.344 },
    target: { type: "speed" as const, source: "explicit" as const, low: 2.123456789, high: 3.987654321, label: "2.123456789–3.987654321 m/s" },
    sportDetail: { kind: "set" as const, exerciseId: "lift.2.5", exerciseName: "Original 2.5 lift", setNumber: 1, load: { value: 12.75, unit: "kg" as const } } }] };
  const plan = spanish(null, fractional);
  assert.match(plan.summary, /90,5 min de duración planificada estimada/);
  assert.match(plan.steps[0], /1609,344 m.*2,123456789–3,987654321 m\/s.*Original 2\.5 lift.*lift\.2\.5.*12,75 kg/);
  const timed = spanish(null, { ...current, exactTimeSeconds: 5430 });
  assert.match(timed.summary, /90,5 min de tiempo estructurado/);
});

test("Spanish pool, strength, station and transition details preserve authored metadata and endpoint meaning", () => {
  const current = session();
  const base = current.steps[0];
  const details: CanonicalStep[] = [
    { ...base, endpoint: { type: "distance", meters: 100 }, target: { type: "swimStroke", stroke: "freestyle", label: "freestyle · Open effort · RPE 3/10", source: "explicit" }, sportDetail: { kind: "pool", lengths: 4, stroke: "freestyle", poolLengthMeters: 25, displayLength: 25, displayUnit: "m", sendOffSeconds: 120 } },
    { ...base, name: "Original lift · set 2", endpoint: { type: "reps", reps: 8 }, sportDetail: { kind: "set", exerciseId: "squat", exerciseName: "Original lift", setNumber: 2, load: { value: 35, unit: "kg" } } },
    { ...base, endpoint: { type: "distance", meters: 50 }, sportDetail: { kind: "station", stationId: "sled", load: { value: 80, unit: "lb" } } },
    { ...base, endpoint: { type: "lap" }, componentSport: "run", sportDetail: { kind: "transition", afterComponentId: "bike-leg" }, target: { type: "open", source: "explicit", label: "Manual transition; follow the app/manifest instructions" } },
    { ...base, sportDetail: { kind: "rest" } },
    { ...base, sportDetail: { kind: "run" } },
  ];
  const { plan, graphic } = manualWorkoutEmailContent({ ...current, steps: details, exactTimeSeconds: null }, null, null, true, "es");
  assert.equal(graphic, null);
  assert.match(plan.steps[0], /100 m.*Estilo: libre.*4 largos × 25 m; libre; salida cada 120 s.*no es un descanso fijo/);
  assert.match(plan.steps[1], /8 repeticiones.*nombre original.*Original lift.*identificador original: squat; serie 2; carga 35 kg/);
  assert.doesNotMatch(plan.steps[1], /set 2/);
  assert.match(plan.steps[2], /Estación.*identificador original.*sled; carga 80 lb/);
  assert.match(plan.steps[3], /vuelta manual \(botón LAP\).*Transición manual.*Componente: carrera.*identificador original.*bike-leg/);
  assert.match(plan.steps[4], /Descanso/);
  assert.match(plan.steps[5], /Tramo de carrera/);
  assert.match(plan.limitations.join(" "), /No hay un gráfico a escala temporal/);
});

test("Spanish calendar, image alt text, preparation and limitations use the same authored plan", () => {
  const s = session("bike", { ftp: 200 });
  const n = nutrition();
  const { plan, graphic } = manualWorkoutEmailContent(s, n, null, true, "es");
  assert.ok(graphic);
  assert.equal(plan.graphicAlt, plan.steps.join("; "));
  assert.match(plan.preparation.join(" "), /No se han verificado el tiempo ni la ubicación.*si hace calor.*toalla/);
  assert.match(plan.preparation.join(" "), /Opcional.*Sin retener la respiración/);
  assert.match(plan.limitations.join(" "), /no ofrece un porcentaje de VO2max/);
  assert.match(plan.limitations.join(" "), /no una respuesta fisiológica medida/);
  const calendar = manualWorkoutCalendarDescription(s, n, null, "es");
  assert.match(calendar, /Entrenamiento \(referencias del plan actual\):/);
  for (const heading of ["Preparación:", "Antes:", "Durante:", "Después:", "Limitaciones:"]) assert.ok(calendar.includes(heading));
  assert.doesNotMatch(calendar, /Workout \(|Preparation:|Before:|During:|After:|Limits:|Plain-text|PRIVATE_TITLE/);
});
