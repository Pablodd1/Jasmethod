"use client";
import {useState} from 'react';
import {recordReportedAnchors,reportedAnchor} from '@/lib/reported-anchors';
import {saveReviewedProfile} from '@/lib/profile-client';
import {dateKey} from '@/lib/dates';
import {ProfileMeasurementInput} from './ProfileMeasurementInput';
import {fmtPace,fmtSwimPace,type UnitSystem} from '@/lib/units';
const fields=['ftp','runPaceBase','swimPaceBase'] as const;
export function DatedTrainingReferenceEditor({profile,revision,timezone,units,es,disabled,onSaved}:{profile:any;revision:string|null;timezone:string;units:UnitSystem;es:boolean;disabled:boolean;onSaved:()=>Promise<void>}){
 const [field,setField]=useState<typeof fields[number]>('runPaceBase'),[value,setValue]=useState(''),[date,setDate]=useState(''),[validity,setValidity]=useState<string|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[status,setStatus]=useState('');
 const labels={ftp:es?'FTP de ciclismo (W)':'Cycling FTP (W)',runPaceBase:es?'Ritmo umbral de carrera':'Run threshold pace',swimPaceBase:es?'Ritmo CSS de natación':'Swim CSS pace'};
 async function save(){if(busy||disabled)return;setError('');setStatus('');setBusy(true);try{
  if(!value||validity||!Number.isFinite(Number(value)))throw Error(es?'Revisa el valor y las unidades.':'Review the value and units.');
  const manualPrs=recordReportedAnchors(profile?.manualPrs,{[field]:Number(value)},date,dateKey(new Date(),timezone));
  await saveReviewedProfile({[field]:Number(value),manualPrs},revision);await onSaved();setValue('');setDate('');setStatus(es?'Referencia guardada.':'Reference saved.');
 }catch(e){setError((e as Error).message);}finally{setBusy(false);}}
 return <section className="card space-y-3"><h2 className="font-display font-bold text-lg">{es?'Ritmo y potencia por deporte':'Pace and power by sport'}</h2>
 <p className="text-sm">{es?'Revisa primero los datos disponibles. Si falta una referencia conocida, añade su valor y fecha. Una marca personal no se convierte automáticamente en umbral.':'Review available records first. If a known reference is missing, add its value and date. A personal record does not automatically become a threshold.'}</p>
 <dl className="space-y-2">{fields.map(f=>{const r=reportedAnchor(profile,f,new Date(),timezone);return <div key={f}><dt>{labels[f]}</dt><dd>{r?`${f==='ftp'?`${r.value} W`:f==='runPaceBase'?fmtPace(r.value,units):fmtSwimPace(r.value,units)} · ${r.observedAt} · ${es?'declarada':'athlete reported'}`:'—'}</dd></div>;})}</dl>
 <details><summary className="min-h-11 cursor-pointer">{es?'Añadir referencia conocida':'Add a known reference'}</summary><fieldset disabled={busy||disabled} className="space-y-3 pt-3">
 <label className="block">{es?'Referencia por deporte':'Sport reference'}<select aria-label={es?"Referencia por deporte":"Sport reference"} className="input w-full" value={field} onChange={e=>{setField(e.target.value as typeof field);setValue('');setDate('');setValidity(null);setStatus('');setError('');}}>{fields.map(f=><option key={f} value={f}>{labels[f]}</option>)}</select></label>
 {field==='ftp'?<label className="block">W<input type="number" className="input w-full" value={value} onChange={e=>setValue(e.target.value)}/></label>:<ProfileMeasurementInput key={field} field={field} value={value} units={units} label={labels[field]} es={es} onChange={setValue} onValidityChange={(_,m)=>setValidity(m)}/>}
 <label className="block">{es?'Fecha de referencia':'Reference date'}<input type="date" className="input w-full" max={dateKey(new Date(),timezone)} value={date} onChange={e=>setDate(e.target.value)}/></label>
 <button type="button" className="btn-primary" onClick={()=>void save()}>{busy?'…':es?'Guardar referencia':'Save reference'}</button></fieldset>{disabled&&<p role="status">{es?'Revisa primero los cambios pendientes del perfil.':'Review pending profile edits first.'}</p>}</details>
 {error&&<p role="alert">{error}</p>}{status&&<p role="status">{status}</p>}
 </section>;
}
