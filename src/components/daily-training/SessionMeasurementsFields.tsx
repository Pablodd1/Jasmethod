import React from 'react';
import { observedSweatRate, sessionWeightInput, weightChange, type SessionObservations } from '@/lib/session-observations';
import { readActualFueling } from '@/lib/actual-fueling';
import { weightToDisplay, type UnitSystem } from '@/lib/units';

export function SessionMeasurementsFields({ saved = {}, details, actualMinutes, es = false, units = 'metric' }: { saved?: SessionObservations; details?: unknown; actualMinutes?: number | null; es?: boolean; units?: UnitSystem }) {
  const change = weightChange(saved.preWeightKg, saved.postWeightKg);
  const fueling = readActualFueling(details);
  const sweat = observedSweatRate(saved.preWeightKg, saved.postWeightKg, fueling?.fluidMl, fueling?.urineMl, actualMinutes);
  const unit = units === 'imperial' ? 'lb' : 'kg';
  return <div className="space-y-3">
    <fieldset className="rounded-lg border p-3">
      <legend className="font-medium">{es ? 'Peso antes y después (opcional)' : 'Weight before and after (optional)'}</legend>
      <p className="text-sm my-2">{es ? 'Registra solo lo que mediste. Usa la misma báscula y ropa seca.' : 'Enter only what you measured. Use the same scale and dry clothing.'}</p>
      <div className="grid gap-3 sm:grid-cols-2">
        {(['preWeightKg', 'postWeightKg'] as const).map(name => <label key={name}>{name === 'preWeightKg' ? (es ? `Peso antes (${unit})` : `Weight before (${unit})`) : (es ? `Peso después (${unit})` : `Weight after (${unit})`)}<input name={name} className="input" type="number" min={weightToDisplay(20, units)} max={weightToDisplay(350, units)} step="any" defaultValue={sessionWeightInput(saved[name], units)} placeholder={es ? 'Desconocido' : 'Unknown'} /></label>)}
      </div>
      {change && <p className="text-sm mt-2" role="status">{es ? 'Cambio neto guardado' : 'Saved net mass change'}: {change.lostKg > 0 ? '−' : change.lostKg < 0 ? '+' : ''}{Math.abs(weightToDisplay(change.lostKg, units)).toFixed(2)} {unit} ({Math.abs(change.percent)}%). {es ? 'No es una tasa de sudoración.' : 'This is not a sweat rate.'}</p>}
      {sweat && <p className="text-sm mt-2">{es ? 'Estimación de sudoración con datos guardados' : 'Sweat-rate estimate from saved reports'}: {sweat.litersPerHour} L/h. {es ? 'Peso antes − después + líquido − orina, dividido por horas reales. Comida, ropa mojada y sesiones largas añaden error. No mide sodio ni cambia automáticamente tu plan de hidratación.' : 'Before − after mass + fluid − urine, divided by actual hours. Food, wet clothing and long sessions add error. This does not measure sodium or automatically change your hydration plan.'}</p>}
    </fieldset>
    <details className="rounded-lg border p-3">
      <summary className="cursor-pointer font-medium">{es ? 'FC, potencia y calorías (opcional)' : 'HR, power & calories (optional)'}</summary>
      <p className="text-sm my-2">{es ? 'Resultados realizados, no objetivos. Deja sin informar lo que no sepas.' : 'Actual results, separate from targets. Leave unknown values blank.'}</p>
      <div className="grid gap-3 sm:grid-cols-2">
        {([
          ['avgHr', es ? 'FC media (bpm)' : 'Average HR (bpm)', 20, 240, '1'],
          ['avgPower', es ? 'Potencia media realizada (W, del dispositivo de este deporte)' : 'Actual average power (W, this sport’s device)', 0, 2500, 'any'],
          ['calories', es ? 'Energía reportada (kcal)' : 'Reported energy (kcal)', 0, 20000, '1'],
        ] as const).map(([name,label,min,max,step]) => <label key={name}>{label}<input name={name} className="input" type="number" min={min} max={max} step={step} defaultValue={saved[name] ?? ''} placeholder={es ? 'Desconocido' : 'Unknown'} /></label>)}
      </div>
      <p className="text-sm mt-2">{es ? 'Las calorías del dispositivo son estimaciones y no se convierten automáticamente en gramos de carbohidrato.' : 'Device calories are estimates and are not automatically converted into carbohydrate grams.'}</p>
    </details>
  </div>;
}
