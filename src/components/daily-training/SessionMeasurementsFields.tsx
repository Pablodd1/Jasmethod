import React from 'react';
import { observedSweatRate, weightChange, type SessionObservations } from '@/lib/session-observations';
import { readActualFueling } from '@/lib/actual-fueling';
export function SessionMeasurementsFields({ saved = {}, details, actualMinutes, es = false }: { saved?: SessionObservations; details?: unknown; actualMinutes?: number | null; es?: boolean }) {
  const change = weightChange(saved.preWeightKg, saved.postWeightKg);
  const fueling = readActualFueling(details);
  const sweat = observedSweatRate(saved.preWeightKg, saved.postWeightKg, fueling?.fluidMl, fueling?.urineMl, actualMinutes);
  return <details className="my-3 rounded-lg border p-3">
    <summary className="cursor-pointer font-medium">{es ? 'FC, potencia, calorías y peso (opcional)' : 'HR, power, calories & weight (optional)'}</summary>
    <p className="text-sm my-2">{es ? 'Resultados realizados, no objetivos. No necesitas dispositivo. No copies valores del plan.' : 'Actual results, separate from targets. No device required. Do not copy planned values into these fields.'}</p>
    <div className="grid gap-3 sm:grid-cols-2">
      {([
        ['avgHr', es ? 'FC media (bpm)' : 'Average HR (bpm)', 20, 240, '1'],
        ['avgPower', es ? 'Potencia media realizada (W, del dispositivo de este deporte)' : 'Actual average power (W, this sport’s device)', 0, 2500, 'any'],
        ['calories', es ? 'Energía reportada (kcal)' : 'Reported energy (kcal)', 0, 20000, '1'],
        ['preWeightKg', es ? 'Peso antes (kg)' : 'Weight before (kg)', 20, 350, '0.01'],
        ['postWeightKg', es ? 'Peso después (kg)' : 'Weight after (kg)', 20, 350, '0.01'],
      ] as const).map(([name,label,min,max,step]) => <label key={name}>{label}<input name={name} className="input" type="number" min={min} max={max} step={step} defaultValue={saved[name] ?? ''} placeholder={es ? 'Desconocido' : 'Unknown'} /></label>)}
    </div>
    <p className="text-sm mt-2">{es ? 'Las calorías del dispositivo son estimaciones: no se convierten automáticamente en gramos de carbohidrato. El peso cambia principalmente por líquidos; no mide grasa ni calorías.' : 'Device calories are estimates: they are not automatically converted into carbohydrate grams. Weight change mainly reflects fluids; it does not measure fat loss or calories.'}</p>
    {change && <p className="text-sm mt-2" role="status">{es ? 'Cambio neto guardado' : 'Saved net mass change'}: {change.lostKg > 0 ? '−' : change.lostKg < 0 ? '+' : ''}{Math.abs(change.lostKg)} kg ({Math.abs(change.percent)}%). {es ? 'No es una tasa de sudoración.' : 'This is not a sweat rate.'}</p>}
    {sweat && <p className="text-sm mt-2">{es ? 'Estimación de sudoración con datos guardados' : 'Sweat-rate estimate from saved reports'}: {sweat.litersPerHour} L/h. {es ? 'Peso antes − después + líquido − orina, dividido por horas reales. Usa la misma báscula y ropa seca; comida, ropa mojada y sesiones largas añaden error. No mide sodio ni cambia automáticamente tu plan de hidratación.' : 'Before − after mass + fluid − urine, divided by actual hours. Use the same scale and dry clothing; food, wet clothing and long sessions add error. This does not measure sodium or automatically change your hydration plan.'}</p>}
  </details>;
}
