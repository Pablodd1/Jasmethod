"use client";

import React, { useId, useState } from 'react';
import type { ScenarioLegResult } from '@/lib/race-scenario';
import { buildExecutionSplits, executionSplitsCsv } from '@/lib/race-execution-splits';

const focus = 'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ocean-800';
function clock(seconds: number) {
  return `${Math.floor(seconds / 3600)}:${String(Math.floor(seconds % 3600 / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
}
export function RaceExecutionSplits({ leg, es }: { leg: ScenarioLegResult; es: boolean }) {
  const [unit, setUnit] = useState('km');
  const id = useId(), interval = unit === 'mi' ? 1609.344 : 1000;
  const rows = buildExecutionSplits(leg, interval);
  const say = (en: string, spanish: string) => es ? spanish : en;
  if (!rows.length) return null;
  function download() {
    const url = URL.createObjectURL(new Blob([executionSplitsCsv(rows)], { type: 'text/csv;charset=utf-8' }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `scenario-${leg.sport}-${unit}-splits.csv`;
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return <details className="mt-4 min-w-0 border-t border-slate-200 pt-3">
    <summary className={`min-h-11 cursor-pointer py-2 text-sm font-semibold text-ocean-900 ${focus}`}>{say('Your kilometer / mile splits', 'Tus parciales por kilómetro / milla')}</summary>
    <p className="mt-2 text-xs leading-relaxed text-slate-600">{say('Same selected effort and course calculation, divided into easy-to-follow splits. These are planning times, not a prediction or proof that you can sustain this effort. Times start at this leg; transitions and stops are not included.', 'El mismo esfuerzo y recorrido elegidos, divididos en parciales fáciles de seguir. Son tiempos de planificación, no una predicción ni prueba de que puedas sostener el esfuerzo. El reloj empieza en este tramo; no incluye transiciones ni paradas.')}</p>
    <div className="my-3 flex flex-wrap items-center gap-3">
      <label htmlFor={id} className="text-xs font-semibold">{say('Split distance', 'Distancia del parcial')}</label>
      <select id={id} value={unit} onChange={event => setUnit(event.target.value)} className={`min-h-11 rounded-lg border border-slate-300 bg-white px-3 text-sm ${focus}`}><option value="km">1 km</option><option value="mi">1 {say('mile', 'milla')}</option></select>
      <button type="button" onClick={download} className={`min-h-11 rounded-lg border border-slate-300 px-3 text-xs font-semibold text-ocean-950 ${focus}`}>{say('Download CSV', 'Descargar CSV')}</button>
    </div>
    <div className="max-h-72 overflow-auto" tabIndex={0} role="region" aria-label={say('Scrollable execution splits', 'Parciales de ejecución desplazables')}>
      <table className="w-full text-left text-xs"><caption className="pb-2 text-left text-slate-600">{say('Rounded to seconds for execution. Split times add up to the displayed leg total; this precision does not imply accuracy.', 'Redondeados a segundos para la ejecución. Los parciales suman el total mostrado del tramo; esta precisión no implica exactitud.')}</caption>
        <thead><tr><th scope="col" className="p-2">{say('At', 'En')} ({unit})</th><th scope="col" className="p-2">{say('Split', 'Parcial')}</th><th scope="col" className="p-2">{say('Leg elapsed', 'Acumulado')}</th></tr></thead>
        <tbody>{rows.map((row, index) => <tr key={index} className="border-t border-slate-200"><th scope="row" className="p-2 font-normal">{(row.endDistanceM / interval).toFixed(3)}</th><td className="p-2 font-mono">{clock(row.durationSeconds)}</td><td className="p-2 font-mono">{clock(row.cumulativeSeconds)}</td></tr>)}</tbody>
      </table>
    </div>
  </details>;
}
