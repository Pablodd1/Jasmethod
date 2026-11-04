"use client";
import {useState} from 'react';
import {readSportHeartRate,sportHeartRateTarget,recordSportHeartRate,SPORT_HR_SPORTS,type SportHrSport,type SportHrMetric} from '@/lib/sport-heart-rate';
import {saveReviewedProfile} from '@/lib/profile-client';
import {dateKey} from '@/lib/dates';

export function SportHeartRateReferences({raw,revision,timezone,es,disabled,onSaved}:{raw:unknown;revision:string|null;timezone:string;es:boolean;disabled:boolean;onSaved:()=>Promise<void>}) {
  const [sport,setSport]=useState<SportHrSport>('run'),[metric,setMetric]=useState<SportHrMetric>('maxHr');
  const [value,setValue]=useState(''),[observedOn,setObservedOn]=useState(''),[busy,setBusy]=useState(false),[message,setMessage]=useState(''),[error,setError]=useState('');
  const labels={run:es?'Carrera':'Run',bike:es?'Ciclismo':'Bike',swim:es?'Natación':'Swim',hyrox:'HYROX'};
  async function save(){if(busy||disabled)return;setBusy(true);setError('');setMessage('');try{
    if(!value.trim())throw Error(es?'Añade una FC conocida.':'Enter a known HR value.');
    const manualPrs=recordSportHeartRate(raw,{sport,metric,value:Number(value),observedOn},dateKey(new Date(),timezone));
    await saveReviewedProfile({manualPrs},revision);await onSaved();setValue('');setObservedOn('');setMessage(es?'Referencia guardada.':'Reference saved.');
  }catch(e){setError((e as Error).message);}finally{setBusy(false);}}
  return <section className="card space-y-3" aria-label={es?'Referencias de FC por deporte':'Heart-rate references by sport'}>
    <h2 className="font-display font-bold text-lg">{es?'FC por deporte':'Heart rate by sport'}</h2>
    <p className="text-sm">{es?'Revisa los registros de origen. Añade solo máximos o umbrales conocidos y su fecha; el pico de una actividad no demuestra la FC máxima.':'Review source records. Add only known maximum or threshold HR and its date; an activity peak does not establish maximum HR.'}</p>
    <div className="grid gap-3 sm:grid-cols-2">{SPORT_HR_SPORTS.map(s=>{const target=['run','bike'].includes(s)?sportHeartRateTarget(raw,s,1,new Date(),timezone):null;return <div className="rounded-xl border p-3" key={s}><h3 className="font-semibold">{labels[s]}</h3>{(['maxHr','lthr'] as const).map(m=>{const r=readSportHeartRate(raw,s,m,new Date(),timezone);return <p className="text-sm" key={m}>{m==='maxHr'?(es?'Máxima':'Maximum'):(es?'Umbral':'Threshold')}: {r?`${r.value} bpm · ${r.observedAt} · ${es?'declarada':'athlete reported'}`:'—'}</p>;})}{target&&<p className="text-xs">{es?'Rangos calculados desde la referencia declarada':'Ranges calculated from the reported reference'} ({target.reference.metric} · {target.reference.observedAt}): {[1,2,3,4,5].map(z=>{const r=sportHeartRateTarget(raw,s,z,new Date(),timezone);return r?`Z${z} ${r.low}–${r.high} bpm`:'';}).join(' · ')}</p>}</div>;})}</div>
    <details><summary className="min-h-11 cursor-pointer">{es?'Añadir una referencia que falta':'Add a missing reference'}</summary><fieldset disabled={disabled||busy} className="space-y-3 pt-3">
      <label className="block">{es?'Deporte':'Sport'}<select aria-label={es?"Deporte":"Sport"} className="input w-full" value={sport} onChange={e=>setSport(e.target.value as SportHrSport)}>{SPORT_HR_SPORTS.map(s=><option key={s} value={s}>{labels[s]}</option>)}</select></label>
      <label className="block">{es?'Referencia':'Reference'}<select aria-label={es?"Referencia":"Reference"} className="input w-full" value={metric} onChange={e=>setMetric(e.target.value as SportHrMetric)}><option value="maxHr">{es?'FC máxima conocida':'Known maximum HR'}</option><option value="lthr">{es?'FC umbral conocida':'Known threshold HR'}</option></select></label>
      <label className="block">bpm<input className="input w-full" type="number" value={value} onChange={e=>setValue(e.target.value)}/></label>
      <label className="block">{es?'Fecha de observación':'Observation date'}<input className="input w-full" type="date" max={dateKey(new Date(),timezone)} value={observedOn} onChange={e=>setObservedOn(e.target.value)}/></label>
      <p className="text-sm">{es?'Se guarda como dato declarado, sin convertirlo en un test verificado ni en las zonas de otro deporte.':'Saved as an athlete report; it does not become a verified test or a reference for another sport.'}</p>
      <button type="button" className="btn-primary" onClick={()=>void save()}>{busy?'…':es?'Guardar referencia':'Save reference'}</button>
    </fieldset>{disabled&&<p role="status">{es?'Guarda o revisa primero los cambios del perfil.':'Save or review your pending profile edits first.'}</p>}</details>
    {error&&<p role="alert">{error}</p>}{message&&<p role="status">{message}</p>}
  </section>;
}
