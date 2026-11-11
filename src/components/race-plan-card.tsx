import { RACE_MORNING_STEPS, type RaceMorningStep, type RaceScenarioMetadata } from "@/lib/race-scenario-metadata";
import { fmtPace, fmtSwimPace } from "@/lib/units";
import type { RaceScenarioInput, RaceScenarioResult } from "@/lib/race-scenario";

export type RacePlanSnapshot = {
  id: string;
  createdAt: string;
  input: RaceScenarioInput;
  metadata?: RaceScenarioMetadata | null;
  result: RaceScenarioResult;
  stale: boolean;
};

const labels: Record<RaceMorningStep, [string, string]> = {
  wake: ["Wake up", "Despertar"],
  breakfast: ["Breakfast", "Desayuno"],
  arrive: ["Arrive", "Llegar"],
  warmup: ["Warm up", "Calentar"],
  stage: ["Report to corral or wave", "Ir al corral o grupo de salida"],
};
export const raceMorningLabel = (step: RaceMorningStep, es: boolean) => labels[step][es ? 1 : 0];

function clock(seconds: number) {
  const n = Math.round(seconds);
  return [Math.floor(n / 3600), String(Math.floor(n % 3600 / 60)).padStart(2, "0"), String(n % 60).padStart(2, "0")].join(":");
}

export function RacePlanCard({ snapshot, es, imperial, preview = false }: { snapshot: RacePlanSnapshot; es: boolean; imperial: boolean; preview?: boolean }) {
  const t = (en: string, spanish: string) => es ? spanish : en;
  const { input, metadata, result, stale } = snapshot;
  const plan = metadata?.racePlan;
  const zone = metadata?.timeZone;
  const start = input.startAt ? Date.parse(input.startAt) : NaN;
  const date = Number.isFinite(start) && zone ? new Intl.DateTimeFormat(es ? "es" : "en", {
    timeZone: zone, dateStyle: "medium", timeStyle: "short",
  }) : null;
  const timeline = plan?.waveConfirmed && date ? RACE_MORNING_STEPS.flatMap(step => {
    const before = plan.minutesBeforeWave[step];
    return before == null ? [] : [{ step, before, time: date.format(start - before * 60_000) }];
  }).sort((a, b) => b.before - a.before) : [];
  const dist = new Intl.NumberFormat(es ? "es" : "en", {maximumFractionDigits:3});
  const distFactor = imperial ? 1609.344 : 1000;
  const units = imperial ? "imperial" : "metric";
  const recordedNotes = [
    [t("Rehearsal and taper", "Ensayo y descarga"), plan?.rehearsal],
    [t("Race effort cues", "Indicaciones de esfuerzo"), plan?.execution],
    [t("Logistics and practiced fueling", "Logística y nutrición practicada"), plan?.logistics],
  ];
  return <section className="rounded-xl border border-ocean-200 bg-white p-4 space-y-3 min-w-0" aria-label={t("Race plan", "Plan de carrera")}>
    <header><h3 className="font-display text-xl font-semibold">{input.name}</h3>
      <p className="text-sm">{metadata?.location || t("Venue not recorded", "Sede sin registrar")} · {plan?.waveConfirmed && date ? date.format(start) + " · " + zone : t("Wave time not confirmed", "Hora de salida sin confirmar")}</p>
      <p className="text-sm">{preview ? t("Unsaved preview · Review these assumptions before saving.", "Vista previa sin guardar · Revisa estos supuestos antes de guardar.") : t("Saved scenario · Targets and times are assumptions to review.", "Escenario guardado · Los objetivos y tiempos son supuestos para revisar.")}</p>
      {stale && <p role="status" className="text-sm text-amber-900">{t("This version needs review: saved evidence, weather, or the model changed or expired.", "Esta versión requiere revisión: cambiaron o caducaron los datos, el clima o el modelo.")}</p>}
    </header>
    <ul className="space-y-2 text-sm">
      {input.legs.map(leg => {
        const modeled = result.legs.find(row => row.id === leg.id);
        const target = leg.targetConfirmed && leg.target != null ? leg.sport === "bike" ? leg.target + " W" : leg.sport === "swim" ? fmtSwimPace(leg.target,units) : fmtPace(leg.target,units) : null;
        const sport = leg.sport === "swim" ? t("Swim", "Natación") : leg.sport === "bike" ? t("Bike", "Bici") : t("Run", "Carrera");
        return <li key={leg.id} className="border-t pt-2">
          <strong>{sport} · {dist.format(leg.distanceM / distFactor)} {imperial ? "mi" : "km"}</strong>
          <p>{t("Selected target", "Objetivo elegido")}: {target ?? "—"} · {t("Modeled split", "Parcial modelado")}: {modeled?.durationSeconds == null ? "—" : clock(modeled.durationSeconds)}</p>
          {leg.baseline && <p>{t("Reference date", "Fecha de referencia")}: {leg.baseline.observedAt.slice(0,10)} · {leg.baseline.protocol}</p>}
          {(modeled?.hrTargetBpm || modeled?.runPowerTargetW != null || modeled?.mechanicalWorkKj != null) && <p>
            {modeled.hrTargetBpm && <span className="mr-3">{t("Practiced HR", "Pulso practicado")}: {modeled.hrTargetBpm.join("–")} bpm</span>}
            {modeled.runPowerTargetW != null && <span className="mr-3">{t("Running-power reference", "Referencia de potencia de carrera")}: {modeled.runPowerTargetW} W{leg.runPowerDevice ? " · " + leg.runPowerDevice : ""}</span>}
            {modeled.mechanicalWorkKj != null && <span>{t("Modeled mechanical work", "Trabajo mecánico modelado")}: {Math.round(modeled.mechanicalWorkKj)} kJ</span>}
          </p>}
        </li>;
      })}
    </ul>
    {input.eventType === "triathlon" && <p className="text-sm">{t("Entered T1 + T2 allowance", "Tiempo indicado para T1 + T2")}: {input.transitionSeconds > 0 ? clock(input.transitionSeconds) : "—"}</p>}
    <p className="text-sm">{t("Modeled total", "Total modelado")}: {result.durationSeconds == null ? "—" : clock(result.durationSeconds)}</p>
    {result.carbohydrateGrams != null && <p className="text-sm">{t("Modeled carb total at the practiced rate", "Carbohidratos modelados a la tasa practicada")}: {Math.round(result.carbohydrateGrams)} g</p>}
    {timeline.length > 0 && <ol className="space-y-1 text-sm">{timeline.map(row=><li key={row.step}><strong>{row.time}</strong> · {raceMorningLabel(row.step, es)}</li>)}</ol>}
    {recordedNotes.some(([,value])=>value) && <dl className="space-y-2 text-sm">{recordedNotes.map(([label,value])=>value && <div key={label}><dt className="font-semibold">{label}</dt><dd className="whitespace-pre-wrap break-words">{value}</dd></div>)}</dl>}
  </section>;
}
