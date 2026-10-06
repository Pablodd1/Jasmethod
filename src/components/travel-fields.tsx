"use client";

import { useId } from "react";
import type { TravelContext } from "@/lib/travel-context";

export function TravelFields({ value, onChange, es = false }: {
  value?: Partial<TravelContext> | null;
  onChange: (value: TravelContext | null) => void;
  es?: boolean;
}) {
  const id = useId();
  const current: TravelContext = { startDate: null, endDate: null, destinationTimezone: null, equipmentNotes: "", timeNotes: "", maxSessionMinutes: null, ...value };
  const change = (patch: Partial<TravelContext>) => onChange({ ...current, ...patch });
  return <fieldset className="space-y-3 border border-sand-200 rounded-xl p-4">
    <legend className="px-1 font-semibold">{es ? "Viajes (opcional)" : "Travel (optional)"}</legend>
    <p className="text-sm text-slate-600">{es ? "Deja en blanco lo que no sepas. Este contexto no cambia tu zona horaria, historial ni entrenamientos automáticamente; revisa los ajustes con tu entrenador." : "Leave unknown details blank. This context does not automatically change your timezone, history or workouts; review adjustments with your coach."}</p>
    <div className="grid gap-3 sm:grid-cols-2">
      <label htmlFor={`${id}-start`} className="text-sm">{es ? "Fecha de inicio" : "Start date"}<input id={`${id}-start`} type="date" className="input w-full" value={current.startDate ?? ""} onChange={event => change({ startDate: event.target.value || null })} /></label>
      <label htmlFor={`${id}-end`} className="text-sm">{es ? "Fecha de regreso" : "End date"}<input id={`${id}-end`} type="date" className="input w-full" value={current.endDate ?? ""} onChange={event => change({ endDate: event.target.value || null })} /></label>
      <label htmlFor={`${id}-timezone`} className="text-sm">{es ? "Zona horaria del destino" : "Destination timezone"}<input id={`${id}-timezone`} className="input w-full" maxLength={100} placeholder="America/New_York" value={current.destinationTimezone ?? ""} onChange={event => change({ destinationTimezone: event.target.value || null })} /></label>
      <label htmlFor={`${id}-minutes`} className="text-sm">{es ? "Máximo de minutos por sesión (0 = sin tiempo)" : "Maximum minutes per session (0 = no time)"}<input id={`${id}-minutes`} type="number" min={0} max={300} step={1} className="input w-full" value={current.maxSessionMinutes ?? ""} onChange={event => change({ maxSessionMinutes: event.target.value === "" ? null : Number(event.target.value) })} /></label>
    </div>
    <label htmlFor={`${id}-equipment`} className="block text-sm">{es ? "Equipo y lugares disponibles" : "Available equipment and venues"}<textarea id={`${id}-equipment`} className="input w-full" maxLength={1000} value={current.equipmentNotes} onChange={event => change({ equipmentNotes: event.target.value })} /></label>
    <label htmlFor={`${id}-time`} className="block text-sm">{es ? "Horarios y otras limitaciones" : "Schedule and other time constraints"}<textarea id={`${id}-time`} className="input w-full" maxLength={1000} value={current.timeNotes} onChange={event => change({ timeNotes: event.target.value })} /></label>
    {value != null && <button type="button" className="text-sm underline" onClick={() => onChange(null)}>{es ? "Borrar contexto de viaje" : "Clear travel context"}</button>}
  </fieldset>;
}
