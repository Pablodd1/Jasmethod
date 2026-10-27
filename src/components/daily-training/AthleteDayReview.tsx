import React from 'react';
import type { AthleteDayReview as Review } from '@/lib/athlete-day-review';
const paceText = (seconds: number) => { const rounded=Math.round(seconds);return `${Math.floor(rounded/60)}:${String(rounded%60).padStart(2,'0')}`; };
export function AthleteDayReview({ review, plannedMinutes, es = false, onReport, expandRecords = false, onRecordsToggle }: { review: Review; plannedMinutes?: number | null; es?: boolean; onReport: (id: string) => void; expandRecords?: boolean; onRecordsToggle?: (open: boolean) => void }) {
  return <section className="card space-y-3" aria-label={es ? 'Contexto de tu entrenamiento' : 'Your training context'}>
    {review.records.length > 0 && <>
      <h2 className="font-semibold">{es ? 'Ya hay actividad registrada hoy' : 'Activity is already recorded today'}</h2>
      <p className="text-sm">{es ? 'Revisa lo realizado antes de añadir otra sesión. No añadas el plan como trabajo pendiente.' : 'Review what you already did before adding another session. The saved plan is not extra work to catch up.'}</p>
      {review.derivedActivityPolicy?.status === 'insufficient' && <p role="status" className="text-sm text-amber-800">{es ? 'Los registros originales se conservan. Los análisis derivados no están disponibles por datos de origen restringido o desconocido; esto no significa descanso ni capacidad adicional.' : 'Source records are preserved. Derived analysis is unavailable for restricted or unknown origin; this does not mean rest or additional training capacity.'}</p>}
      {(review.possibleCopies ?? 0) > 0 && <p className="text-sm text-amber-800">{es ? 'Posibles copias entre dispositivos: mostramos cada registro, sin sumarlos.' : 'Possible copies across devices: records are shown separately and are not added together.'} <a className="underline" href="/onboard?redo=1&advanced=1&step=race">{es ? 'Revisar copias' : 'Review copies'}</a></p>}
      <details open={expandRecords || undefined} onToggle={event => onRecordsToggle?.(event.currentTarget.open)}><summary className="cursor-pointer">{es ? 'Ver actividad y registrar esfuerzo' : 'See activity & log effort'} ({review.rawRecordCount})</summary>
        {review.records.map(record => <article key={record.id} className="border-t py-3 text-sm space-y-1">
          <h3 className="font-semibold">{record.sport} · {record.title}</h3>
          <p>{record.source} · {record.minutes ?? '—'} min · RPE {record.rpe ?? '—'}/10</p>
          <p>HR {record.avgHr ?? '—'} bpm · {es ? 'Potencia reportada' : 'Reported power'} {record.avgPower ?? '—'} W · {record.calories ?? '—'} kcal ({es ? 'reportadas' : 'reported'})</p>
          {record.distanceKm !== null && <p>{record.distanceKm} km{['run','swim'].includes(record.sport) && record.paceSecondsPerKm !== null ? ` · ${paceText(record.paceSecondsPerKm / (record.sport === 'swim' ? 10 : 1))} / ${record.sport === 'swim' ? '100 m' : 'km'} (${es ? 'derivado del tiempo registrado' : 'derived from recorded time'})` : ''}</p>}
          {record.matchedPlanId ? <p>{es ? 'Sesión vinculada: registra los resultados en la actividad importada.' : 'Linked session: log results on the imported activity.'}</p> : <button type="button" className="btn-secondary" onClick={() => onReport(record.id)}>{es ? 'Registrar esfuerzo y recuperación' : 'Log effort & recovery'}</button>}
        </article>)}
      </details>
    </>}
    {plannedMinutes != null && plannedMinutes > 0 && plannedMinutes < 10 && <div role="status" className="rounded border border-amber-300 p-3 text-sm">
      <h2 className="font-semibold">{es ? 'Revisa esta sesión corta' : 'Review this short session'}</h2>
      <p>{es ? 'El plan guardado tiene' : 'The saved plan contains'} {plannedMinutes} min. {es ? 'Tu configuración actual indica' : 'Your current setup records'} {review.baselineWeeklyMinutes ?? '—'} {es ? 'minutos totales por semana' : 'total minutes per week'}{review.baselineObservedAt ? ` (${review.baselineObservedAt})` : ''}. {es ? 'Un plan guardado puede usar un presupuesto anterior y reducciones del ciclo. Editar la configuración no regenera el plan. Esta duración no mide tu capacidad.' : 'A saved plan may use an older budget and cycle reductions. Editing setup does not regenerate the plan. This duration does not measure your capacity.'}</p>
      <a className="underline" href="/onboard?redo=1&advanced=1&step=race&return=training">{es ? 'Revisar historial y punto de partida; después regenerar el ciclo' : 'Review history and starting volume, then regenerate the cycle'}</a>
    </div>}
    <p className="text-xs text-slate-600">{es ? 'Objetivos por paso: RPE y, cuando existan referencias válidas, ritmo, FC o potencia. Las calorías y resultados de actividad no son objetivos ni necesidades de combustible.' : 'Step targets use RPE and, when valid references exist, pace, HR or power. Activity calories and results are separate from targets and fueling needs.'}</p>
  </section>;
}
