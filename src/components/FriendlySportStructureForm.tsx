"use client";

import React from "react";
import { AthleteMetricInput } from "@/components/AthleteMetricInput";
import { emptyFriendlyStep, type FriendlyStep, type FriendlyStepKind, type FriendlyStructure } from "@/lib/sport-structure-form";

type Props = { id: string; value: FriendlyStructure; disabled: boolean; es: boolean; onChange: (value: FriendlyStructure) => void };
const fieldClass = "input w-full min-w-0";
export function FriendlySportStructureForm({ id, value, disabled, es, onChange }: Props) {
  const stepName = (kind: FriendlyStepKind) => ({ lengths: es ? "Largos de piscina" : "Pool lengths", rest: es ? "Descanso" : "Rest", run: es ? "Carrera" : "Run",
    station: es ? "Estación" : "Station", set: es ? "Serie de ejercicio" : "Exercise set", warmup: es ? "Calentamiento" : "Warm-up", cooldown: es ? "Vuelta a la calma" : "Cool-down" })[kind];
  const kinds: FriendlyStepKind[] = value.kind === "pool" ? ["lengths", "rest"] : value.kind === "hyrox" ? ["warmup", "run", "station", "rest", "cooldown"] : ["warmup", "set", "rest", "cooldown"];
  const change = (index: number, patch: Partial<FriendlyStep>) => onChange({ ...value, steps: value.steps.map((row, n) => n === index ? { ...row, ...patch } : row) });
  function move(index: number, direction: number) {
    const steps = [...value.steps]; [steps[index], steps[index + direction]] = [steps[index + direction], steps[index]]; onChange({ ...value, steps });
  }
  return <div className="space-y-3">
    <p className="text-sm">{es ? "Introduce únicamente movimientos, cargas y cantidades que tú o tu coach hayan revisado. Los campos vacíos no se adivinan. Cada serie o estación se añade por separado." : "Enter only movements, loads and amounts reviewed by you or your coach. Blank fields are never guessed. Add each set or station separately."}</p>
    {value.kind === "pool" && <div className="grid grid-cols-2 gap-2">
      <label htmlFor={`${id}-pool`} className="block text-sm">{es ? "Longitud de piscina" : "Pool length"}<input id={`${id}-pool`} type="number" min="1" max="150" step="any" className={fieldClass} disabled={disabled} value={value.poolLength} onChange={e => onChange({ ...value, poolLength: e.target.value })} /></label>
      <label htmlFor={`${id}-pool-unit`} className="block text-sm">{es ? "Unidad de piscina" : "Pool unit"}<select id={`${id}-pool-unit`} className={fieldClass} disabled={disabled} value={value.poolUnit} onChange={e => onChange({ ...value, poolUnit: e.target.value as "m" | "yd" })}><option value="m">m</option><option value="yd">yd</option></select></label>
    </div>}
    {value.steps.map((row, index) => {
      const rowId = `${id}-step-${index}`;
      const preparation = row.kind === "warmup" || row.kind === "cooldown";
      const endpointOptions = preparation ? ["time"] : row.kind === "set" ? ["reps", "time", "lap"] : row.kind === "run" ? ["distance", "time", "lap"] : ["reps", "distance", "time", "lap"];
      return <fieldset key={index} disabled={disabled} className="rounded-lg border border-slate-300 p-3 min-w-0 space-y-2">
        <legend className="px-1 font-medium">{index + 1}. {stepName(row.kind)}</legend>
        <div className="grid sm:grid-cols-2 gap-2">
          {row.kind !== "rest" && <>
            <label htmlFor={`${rowId}-name`} className="block text-sm">{es ? "Nombre" : "Name"}<input id={`${rowId}-name`} className={fieldClass} maxLength={80} value={row.name} onChange={e => change(index, { name: e.target.value })} /></label>
            <label htmlFor={`${rowId}-zone`} className="block text-sm">{es ? "Zona revisada" : "Reviewed zone"}<select id={`${rowId}-zone`} className={fieldClass} value={row.zone} onChange={e => change(index, { zone: e.target.value })}><option value="">{es ? "Elige una zona" : "Choose a zone"}</option>{[1,2,3,4,5,6,7].map(n => <option key={n} value={`z${n}`}>Z{n}</option>)}</select></label>
          </>}
          {row.kind === "lengths" && <>
            <label htmlFor={`${rowId}-stroke`} className="block text-sm">{es ? "Estilo" : "Stroke"}<select id={`${rowId}-stroke`} className={fieldClass} value={row.stroke} onChange={e => change(index, { stroke: e.target.value })}><option value="">{es ? "Elige un estilo" : "Choose a stroke"}</option>{[["freestyle","Crol","Freestyle"],["backstroke","Espalda","Backstroke"],["breaststroke","Braza","Breaststroke"],["butterfly","Mariposa","Butterfly"],["drill","Técnica","Drill"],["mixed","Mixto","Mixed"],["im","Estilos individual","Individual medley"]].map(([key, spanish, english]) => <option key={key} value={key}>{es ? spanish : english}</option>)}</select></label>
            <label htmlFor={`${rowId}-phase`} className="block text-sm">{es ? "Parte de la sesión" : "Session phase"}<select id={`${rowId}-phase`} className={fieldClass} value={row.phase} onChange={e => change(index, { phase: e.target.value })}><option value="">{es ? "Elige una parte" : "Choose a phase"}</option><option value="warmup">{es ? "Calentamiento" : "Warm-up"}</option><option value="active">{es ? "Principal" : "Main set"}</option><option value="cooldown">{es ? "Vuelta a la calma" : "Cool-down"}</option></select></label>
          </>}
          {!["rest", "lengths"].includes(row.kind) && <label htmlFor={`${rowId}-endpoint`} className="block text-sm">{es ? "Cómo termina el paso" : "Step finish"}<select id={`${rowId}-endpoint`} className={fieldClass} value={row.endpoint} onChange={e => change(index, { endpoint: e.target.value, amount: "" })}><option value="">{es ? "Elige una medida" : "Choose a measure"}</option>{endpointOptions.map(key => <option key={key} value={key}>{key === "time" ? (es ? "Tiempo (min o m:ss)" : "Time (min or m:ss)") : key === "distance" ? (es ? "Metros" : "Metres") : key === "reps" ? (es ? "Repeticiones" : "Repetitions") : (es ? "Finalizar manualmente" : "Finish manually")}</option>)}</select></label>}
          {(row.kind === "rest" || row.kind === "lengths" || (row.endpoint && row.endpoint !== "lap")) && <label htmlFor={`${rowId}-amount`} className="block text-sm">{row.kind === "rest" ? (es ? "Descanso (min o m:ss)" : "Rest (min or m:ss)") : row.kind === "lengths" ? (es ? "Número de largos" : "Number of lengths") : row.endpoint === "distance" ? (es ? "Distancia (m)" : "Distance (m)") : row.endpoint === "reps" ? (es ? "Repeticiones" : "Repetitions") : (es ? "Duración (min o m:ss)" : "Duration (min or m:ss)")}{row.kind === "rest" || row.endpoint === "time" ? <AthleteMetricInput key={`${row.kind}-${row.endpoint}`} id={`${rowId}-amount`} es={es} min={.01} className={fieldClass} value={row.amount} onChange={amount => change(index, { amount })}/> : <input id={`${rowId}-amount`} type="number" min="0.01" step={row.kind === "lengths" || row.endpoint === "reps" ? "1" : "any"} className={fieldClass} value={row.amount} onChange={e => change(index, { amount: e.target.value })} />}</label>}
          {(row.kind === "lengths" || (!preparation && row.kind !== "rest" && row.endpoint && row.endpoint !== "time")) && <label htmlFor={`${rowId}-estimate`} className="block text-sm">{es ? "Tiempo total estimado de este paso (min o m:ss)" : "Estimated total time for this step (min or m:ss)"}<AthleteMetricInput id={`${rowId}-estimate`} es={es} min={1} className={fieldClass} value={row.estimate} onChange={estimate => change(index, { estimate })}/></label>}
          {(row.kind === "station" || row.kind === "set") && <>
            <label htmlFor={`${rowId}-load`} className="block text-sm">{es ? "Carga practicada (opcional; no supuesta)" : "Practiced load (optional; never assumed)"}<input id={`${rowId}-load`} type="number" min="0" max="2000" step="any" className={fieldClass} value={row.load} onChange={e => change(index, { load: e.target.value })} /></label>
            <label htmlFor={`${rowId}-unit`} className="block text-sm">{es ? "Unidad de carga" : "Load unit"}<select id={`${rowId}-unit`} className={fieldClass} value={row.loadUnit} onChange={e => change(index, { loadUnit: e.target.value as "kg" | "lb" })}><option value="kg">kg</option><option value="lb">lb</option></select></label>
          </>}
        </div>
        <label htmlFor={`${rowId}-note`} className="block text-sm">{es ? "Instrucciones (opcional)" : "Instructions (optional)"}<textarea id={`${rowId}-note`} rows={2} maxLength={20000} className={fieldClass} value={row.note} onChange={e => change(index, { note: e.target.value })} /></label>
        <div className="flex flex-wrap gap-2">
          <button type="button" className="btn-secondary text-sm" disabled={disabled || index === 0} onClick={() => move(index, -1)} aria-label={`${es ? "Subir paso" : "Move step up"} ${index + 1}`}>↑</button>
          <button type="button" className="btn-secondary text-sm" disabled={disabled || index === value.steps.length - 1} onClick={() => move(index, 1)} aria-label={`${es ? "Bajar paso" : "Move step down"} ${index + 1}`}>↓</button>
          <button type="button" className="btn-secondary text-sm" disabled={disabled} onClick={() => onChange({ ...value, steps: value.steps.filter((_, n) => n !== index) })}>{es ? "Eliminar paso" : "Remove step"} {index + 1}</button>
        </div>
      </fieldset>;
    })}
    <div className="flex flex-wrap gap-2">{kinds.map(kind => <button key={kind} type="button" className="btn-secondary text-sm" disabled={disabled || value.steps.length >= 1000} onClick={() => onChange({ ...value, steps: [...value.steps, emptyFriendlyStep(kind)] })}>{es ? "Añadir" : "Add"} {stepName(kind)}</button>)}</div>
    <p className="text-sm">{es ? "Los tiempos estimados sirven para respetar el tiempo revisado; no son resultados medidos. Añade descansos explícitos entre pasos. Guardar no aprueba ni envía el entrenamiento al reloj." : "Time estimates keep the structure within the reviewed budget; they are not measured results. Add explicit rests between steps. Saving does not approve or send the workout to a watch."}</p>
  </div>;
}
