"use client";
import {useCallback,useEffect,useState} from "react";
const TYPES=[['ftp','FTP (watts)'],['cp','Critical power (watts)'],['lthr','Threshold heart rate (bpm)'],['run5k','5 km time (seconds)'],['swim','Swim CSS (seconds/100 m)']];
export function BaselineTests({athleteId,onSaved}:{athleteId?:string;onSaved?:()=>void}) {
 const [revision,setRevision]=useState<string>();
 const [tests,setTests]=useState<any[]>([]),[error,setError]=useState(''),[message,setMessage]=useState(''),[busy,setBusy]=useState(false),[type,setType]=useState('ftp');
 const url='/api/benchmarks'+(athleteId?`?athleteId=${encodeURIComponent(athleteId)}`:'');
 const load=useCallback(async()=>{const r=await fetch(url);const d=await r.json();if(!r.ok)throw Error(d.error);setTests(d.tests);setRevision(d.profileRevision);},[url]);
 useEffect(()=>{load().catch(e=>setError(e.message));},[load]);
 async function submit(e:React.FormEvent<HTMLFormElement>){e.preventDefault();const form=e.currentTarget;const f=new FormData(form);setBusy(true);setError('');setMessage('');try{
  const r=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'record',expectedRevision:revision,type,date:f.get('date'),result:f.get('result'),reason:f.get('reason'),applyBaseline:f.get('applyBaseline')==='on'})});const d=await r.json();if(!r.ok){if(r.status===409){await load();setMessage("Latest profile loaded. Review your measured result before trying again.");}throw Error(d.error);}setMessage(d.baselineApplied?'Test and matching baseline saved. Review existing workouts before re-approving delivery.':'Test saved. Existing training baselines were retained.');form.reset();await load();onSaved?.();
 }catch(e){setError((e as Error).message);}finally{setBusy(false);}}
 return <section className="card space-y-3"><h2 className="font-bold text-lg">Baseline tests and measured results</h2><p className="text-sm text-slate-600">Record a completed test without a connected device. Enter measured values only. A 5 km result is retained as performance history and does not automatically become a threshold estimate.</p>
 <form onSubmit={submit} className="space-y-3"><div className="grid sm:grid-cols-3 gap-3"><label>Test<select className="input" value={type} onChange={e=>setType(e.target.value)}>{TYPES.map(([v,l])=><option key={v} value={v}>{l}</option>)}</select></label><label>Test date<input className="input" name="date" type="date" required/></label><label>Measured result<input className="input" name="result" type="number" step="any" min="1" required/></label></div><label className="block">Method / reason<input className="input" name="reason" maxLength={1000} placeholder="Test protocol, equipment, conditions or coach review"/></label>{type!=='run5k'&&<label className="flex gap-2"><input type="checkbox" name="applyBaseline"/>Use this result as the matching current training baseline</label>}<button className="btn-primary" disabled={busy}>{busy?'Saving…':'Record test'}</button></form>
 {error&&<p role="alert" className="text-red-700">{error}</p>}{message&&<p role="status">{message}</p>}<ul className="text-sm space-y-1">{tests.filter(t=>t.completed).slice(-10).reverse().map(t=><li key={t.id}>{t.name} · {String(t.date).slice(0,10)} · {t.result}</li>)}</ul>
 </section>;
}
