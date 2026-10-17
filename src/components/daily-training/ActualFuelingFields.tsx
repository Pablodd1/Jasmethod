import React from "react";
import { actualFuelingRates, readActualFueling } from "@/lib/actual-fueling";

/** Optional actuals, separate from the card's educational intake suggestions. */
export function ActualFuelingFields({ details, actualDurationMin, es = false }: { details?: unknown; actualDurationMin?: number | null; es?: boolean }) {
  const saved = readActualFueling(details), rates = actualFuelingRates(saved, actualDurationMin);
  return <details className="my-3 rounded-lg border p-3">
    <summary className="cursor-pointer font-medium">{es ? "Alimentación realizada (opcional)" : "Fueling actually taken (optional)"}</summary>
    <fieldset className="grid gap-3 pt-3 sm:grid-cols-3">
      <legend className="sr-only">{es ? "Ingesta declarada durante esta sesión" : "Reported intake during this session"}</legend>
      <label>{es ? "Carbohidratos totales (g)" : "Total carbohydrate (g)"}<input className="input" type="number" name="actualCarbsG" min="0" max="1500" step="any" placeholder={es ? "Desconocido" : "Unknown"} defaultValue={saved?.carbsG ?? ""} /></label>
      <label>{es ? "Líquido total (mL)" : "Total fluid (mL)"}<input className="input" type="number" name="actualFluidMl" min="0" max="30000" step="any" placeholder={es ? "Desconocido" : "Unknown"} defaultValue={saved?.fluidMl ?? ""} /></label>
      <label>{es ? "Orina durante la sesión (mL; 0 si no hubo)" : "Urine during session (mL; enter 0 if none)"}<input className="input" type="number" name="actualUrineMl" min="0" max="10000" step="any" placeholder={es ? "Desconocido" : "Unknown"} defaultValue={saved?.urineMl ?? ""} /></label>
      <label>{es ? "Molestias digestivas" : "Gut symptoms"}<select className="input" name="actualGiSymptoms" defaultValue={saved?.giSymptoms ?? ""}><option value="">{es ? "Desconocido / sin informar" : "Unknown / not reported"}</option><option value="none">{es ? "Ninguna" : "None"}</option><option value="mild">{es ? "Leves" : "Mild"}</option><option value="moderate">{es ? "Moderadas" : "Moderate"}</option><option value="severe">{es ? "Intensas" : "Severe"}</option></select></label>
    </fieldset>
    <p className="mt-2 text-sm">{es ? "Registra lo que realmente tomaste durante esta sesión; deja en blanco lo desconocido. Estos datos no aumentan automáticamente tu dosis futura." : "Report what you actually took during this session; leave unknown amounts blank. These reports never automatically raise future intake."}</p>
    {saved && <p className="mt-2 text-sm" role="status">{rates.carbsGPerHour == null ? (es ? "Tasa guardada: —. Se necesitan gramos y minutos reales mayores que cero; no usamos el tiempo planificado." : "Saved rate: —. Reported grams and positive actual minutes are required; planned time is never substituted.") : (es ? `Tasa guardada: ${Number(rates.carbsGPerHour.toFixed(1))} g/h, calculada con ${rates.durationMin} minutos reales declarados.` : `Saved rate: ${Number(rates.carbsGPerHour.toFixed(1))} g/h, calculated from ${rates.durationMin} reported actual minutes.`)}</p>}
  </details>;
}
