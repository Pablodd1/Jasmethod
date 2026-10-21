"use client";
import type { DailyInputContext } from "@/lib/daily-input-context";

export function DailyInputSummary({ context, es }: { context: DailyInputContext | null | undefined; es: boolean }) {
  if (!context) return null;
  const labels = es ? { sleepHours: "Horas de sueño", restingHr: "Pulso en reposo", hrvRmssd: "VFC rMSSD", hrvSdnn: "VFC SDNN" }
    : { sleepHours: "Sleep hours", restingHr: "Resting heart rate", hrvRmssd: "HRV rMSSD", hrvSdnn: "HRV SDNN" };
  return <details className="card" data-testid="daily-input-context">
    <summary className="cursor-pointer font-semibold">{es ? "Datos disponibles y qué falta" : "Available data and what's missing"}</summary>
    {context.readStatus === "unavailable" && <p role="status" className="text-sm mt-2">{es ? "No se pueden consultar las mediciones ahora. Tu plan guardado sigue disponible; puedes añadir datos manualmente." : "Measurements cannot be read right now. Your saved plan is still available; you can add values manually."}</p>}
    {context.bounded.observationsTruncated && <p role="status" className="text-sm mt-2">{es ? "Se alcanzó el límite de lecturas. Puede haber mediciones en conflicto fuera de esta vista; revisa o introduce los valores actuales en el check-in." : "The reading limit was reached. Unread measurements may disagree; review or enter current values in check-in."}</p>}
    <p className="text-sm mt-2">{es ? "Usamos las observaciones disponibles sin pedirte que las escribas otra vez. No sustituyen tus síntomas ni cómo te sientes. Una sincronización no prueba que llegaron mediciones nuevas." : "Available observations do not need to be typed again. They do not answer current symptoms or how you feel. A completed sync does not prove new measurements arrived."}</p>
    <ul className="mt-2 space-y-1 text-sm">{Object.entries(labels).map(([key, label]) => {
      const item = context.metrics[key as keyof typeof context.metrics], value = item.selected;
      const state = item.status === "conflicting" ? (es ? "Fuentes en conflicto" : "Sources disagree") : item.status === "stale" ? (es ? "Datos anteriores" : "Older data") : item.status === "invalid" ? item.provenanceRestricted ? (es ? "Origen no habilitado para análisis" : "Source unavailable for coaching analysis") : (es ? "Medición sin verificar" : "Unverified reading") : (es ? "No disponible" : "Unavailable");
      return <li key={key}><strong>{label}:</strong> {value ? `${value.value} ${value.unit} · ${value.source} · ${value.observedDay}` : state}{!value && (item.provenanceRestricted || context.bounded.observationsTruncated) && item.latest && <span className="block text-xs text-slate-500">{es ? "Registro guardado" : "Stored reading"}: {item.latest.value} {item.latest.unit} · {item.latest.source} · {item.latest.observedDay}</span>}</li>;
    })}</ul>
    <p className="text-xs text-slate-500 mt-2">{es ? "Las fechas son las observaciones guardadas. La hora exacta del sensor puede no estar disponible. Puedes corregir datos en el check-in; no mezclamos rMSSD y SDNN." : "Dates refer to stored observations. Exact sensor time may be unavailable. Correct values in check-in; rMSSD and SDNN are kept separate."}</p>
    {context.completedWorkouts.length > 0 && <p className="text-sm mt-2">{es ? "Hay actividad importada o informada: no tienes que volver a introducir su duración conocida. Solo falta el esfuerzo o el resultado que no haya llegado." : "Imported or reported activity is available: its known duration does not need to be entered again. Add only effort or outcome information that is still missing."} <a className="underline" href="/checkin">{es ? "Revisar actividad" : "Review activity"}</a></p>}
  </details>;
}
