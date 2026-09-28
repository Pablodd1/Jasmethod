import { useEffect, useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import type { DailyTraining, Guidance, PaceKey, Segment } from './training-contract';
import { plannedSeconds } from './training-contract';


type Props = {
  plan: DailyTraining;
  onFocusReady: (ready: boolean) => Promise<void>;
  onCompletion: (actual: { durationMinutes: number | null; sessionRpe: number | null; comments: string | null }) => Promise<void>;
};

const paceNames: Record<PaceKey,string> = { mile: 'Mile / VO₂ style', '5k': '5K', '10k': '10K', half: 'Half marathon', marathon: 'Marathon', easy: 'Easy' };
const paceKeys: PaceKey[] = ['mile','5k','10k','half','marathon','easy'];
function pace(seconds: number | null | undefined, metric: boolean) {
  if (seconds == null || !Number.isFinite(seconds)) return '—';
  const value = Math.round(metric ? seconds / 1.609344 : seconds);
  return `${Math.floor(value/60)}:${String(value%60).padStart(2,'0')}/${metric?'km':'mi'}`;
}
function GuidanceCard({ number, title, guide, children }: {number: string; title: string; guide: Guidance; children?: ReactNode}) {
  return <details className="jmm-panel"><summary><span className="jmm-num">{number}</span><b>{title}</b><span className="jmm-plus" aria-hidden="true">+</span></summary><div className="jmm-panel-body"><strong className="jmm-panel-title">{guide.title}</strong><ul>{guide.items.map((item,i)=><li key={i}>{item}</li>)}</ul>{guide.note && <p className="jmm-note">{guide.note}</p>}{children}</div></details>;
}
function targetText(s: Segment, metric: boolean) {
  const t=s.target, lo=t.paceLowSecondsPerMile, hi=t.paceHighSecondsPerMile;
  const p=lo==null||hi==null?'':` · ${pace(lo,metric)}${lo===hi?'':`–${pace(hi,metric)}`}`;
  const r=t.rpeLow==null||t.rpeHigh==null?'':` · RPE ${t.rpeLow}–${t.rpeHigh}/10`;
  return `${t.label}${p}${r}`;
}
export function DailyTrainingScreen({plan,onFocusReady,onCompletion}:Props) {
  const {session,profile,blocks,guidance}=plan;
  const [focus,setFocus]=useState(plan.completion.focusReady);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const [minutes,setMinutes]=useState<number | ''>('');
  const [rpe,setRpe]=useState<number | ''>('');
  const [comments,setComments]=useState('');
  const [saved,setSaved]=useState(Boolean(plan.completion.submittedAt));
  const [remaining,setRemaining]=useState<number | null>(null);
  useEffect(()=>{setFocus(plan.completion.focusReady);setSaved(Boolean(plan.completion.submittedAt));setRemaining(null);setError('')},[session.id,session.revision,plan.completion.focusReady,plan.completion.submittedAt]);
  useEffect(()=>{if(remaining===null||remaining<=0)return;const id=window.setInterval(()=>setRemaining(r=>r===null?null:Math.max(0,r-1)),1000);return()=>window.clearInterval(id)},[remaining===null,remaining===0]);
  const metric=profile.unitSystem==='metric';
  const actualSeconds=plannedSeconds(blocks),planned=session.totalMinutes*60;
  const mismatch=Math.abs(actualSeconds-planned)>1;
  const totalChart=actualSeconds||1;
  const chart=blocks.flatMap(block=>Array.from({length:block.repeat},(_,i)=>block.segments.map(s=>({...s, chartKey:`${block.id}-${i}-${s.id}`}))).flat());
  async function toggleFocus(){const next=!focus;setBusy(true);setError('');try{await onFocusReady(next);setFocus(next)}catch{setError('Could not save focus. Try again.')}finally{setBusy(false)}}
  async function submit(e:FormEvent){e.preventDefault();if(rpe!==''&&(rpe<1||rpe>10)){setError('Choose an effort between 1 and 10.');return}setBusy(true);setError('');try{await onCompletion({durationMinutes:minutes===''?null:minutes,sessionRpe:rpe===''?null:rpe,comments:comments.trim()||null});setSaved(true)}catch{setError('Could not save the workout. Your entries are still here; try again.')}finally{setBusy(false)}}
  return <main className="jmm-screen">
    <header className="jmm-brand"><span className="jmm-monogram">j.</span><div><b>JAS MIAMI METHOD</b><small>DAILY TRAINING</small></div><span className="jmm-kicker">{session.sport.toUpperCase()}</span></header>
    <section className="jmm-hero"><small>YOUR SESSION · {session.dateLocal}</small><h1>{session.title}</h1><p>{session.subtitle}</p><span className="jmm-pill">{session.planStatus.replace('_',' ')}</span><span className="jmm-pill">{session.sport}</span></section>
    <section className="jmm-metrics" aria-label="Workout overview"><div><small>TIME</small><b>{session.totalMinutes} min</b><span>with recovery</span></div><div><small>DENSITY</small><b>{session.density.score} / 10</b><span>{session.density.label}</span></div><div><small>ENERGY</small><b>{session.calories.kcal==null?'—':`~${Math.round(session.calories.kcal)} kcal`}</b><span>{session.calories.kcal==null?(session.calories.missingReason||'Unavailable'):session.calories.method==='wearable'?'device reported':'rough estimate'}</span></div></section>
    {mismatch && <p className="jmm-alert" role="alert">Plan needs review: block durations add to {Math.round(actualSeconds/60)} min; the header says {session.totalMinutes} min.</p>}
    {error && <p className="jmm-alert" role="alert">{error}</p>}
    <details className="jmm-panel"><summary><span className="jmm-num">00</span><b>Your training reference</b><span className="jmm-plus" aria-hidden="true">+</span></summary><div className="jmm-panel-body"><p className="jmm-subtle">Athlete profile updated {profile.updatedAt.slice(0,10)}. Targets are plan references, not live measurements.</p><div className="jmm-pace-grid">{paceKeys.map(key=><div key={key}><small>{paceNames[key]}</small><b>{pace(profile.paces[key].secondsPerMile,metric)}</b><span>{profile.paces[key].status==='missing'?(profile.paces[key].missingReason||'Add benchmark'):profile.paces[key].status.replace('_',' ')}</span></div>)}</div><p>Threshold HR: <b>{profile.thresholdHeartRate.bpm==null?'—':`${profile.thresholdHeartRate.bpm} bpm`}</b> · {profile.thresholdHeartRate.status.replace('_',' ')}</p><a href={plan.links.editProfile}>Edit training profile</a></div></details>
    <GuidanceCard number="01" title="Before you begin · Focus" guide={guidance.focus}><button type="button" className="jmm-button" disabled={busy} aria-pressed={focus} onClick={toggleFocus}>{focus?'Focus ready ✓':'Mark focus ready'}</button></GuidanceCard>
    <GuidanceCard number="02" title="Before training · Fuel" guide={guidance.preFuel}/>
    <section className="jmm-chart-card" aria-label="Workout effort graph"><div className="jmm-row"><b>Session map</b><small>effort by time · illustrative</small></div><div className="jmm-chart" role="img" aria-label={blocks.map(b=>`${b.repeat} times ${b.title}: ${b.segments.map(s=>`${s.seconds/60} minutes ${s.title}`).join(', ')}`).join('; ')}>{chart.map(s=><div key={s.chartKey} className={`jmm-bar jmm-${s.kind}`} style={{flexGrow:s.seconds/totalChart,flexBasis:0}} title={`${s.title} · ${s.seconds/60} min`} />)}</div><div className="jmm-legend">{['easy','prep','work','recover','cool'].map(k=><span key={k}><i className={`jmm-${k}`} />{k}</span>)}</div></section>
    <section className="jmm-workout"><small className="jmm-kicker">03 / STRUCTURED TRAINING</small><h2>Every minute has a purpose.</h2>{blocks.map(block=><article key={block.id} className={`jmm-workout-block jmm-border-${block.segments[0]?.kind||'other'}`}><div className="jmm-row"><h3>{block.title}{block.repeat>1?` · ${block.repeat} rounds`:''}</h3><small>{Math.round(block.repeat*block.segments.reduce((n,s)=>n+s.seconds,0)/60)} min</small></div>{block.segments.map(s=><div className="jmm-segment" key={s.id}><strong>{s.seconds%60===0?`${s.seconds/60} min`:`${s.seconds}s`} · {s.title}</strong><p>{s.instruction}</p><span>{targetText(s,metric)}</span>{s.target.note&&<small>{s.target.note}</small>}</div>)}</article>)}</section>
    <details className="jmm-panel"><summary><span className="jmm-num">04</span><b>Pace and effort guide</b><span className="jmm-plus" aria-hidden="true">+</span></summary><div className="jmm-panel-body"><p className="jmm-subtle">Current athlete benchmarks · {metric?<>per km</>:<>per mile</>}</p><div className="jmm-pace-grid">{paceKeys.map(key=><div key={key}><small>{paceNames[key]}</small><b>{pace(profile.paces[key].secondsPerMile,metric)}</b><span>{profile.paces[key].status.replace('_',' ')}</span></div>)}</div><p className="jmm-note">Short reps can use mile or 5K reference; threshold work may use 5K–10K reference; sustained runs may use half or marathon reference. The coach's actual segment target above takes priority. Terrain, heat and perceived effort change the execution.</p></div></details>
    <GuidanceCard number="05" title="After training · Recovery food" guide={guidance.postFuel}/>
    <GuidanceCard number="06" title="Downshift · Breathing" guide={guidance.downshift}><button type="button" className="jmm-button" onClick={()=>setRemaining(remaining===null||remaining===0?guidance.downshift.timerSeconds:null)} disabled={!guidance.downshift.timerSeconds}>{remaining===null||remaining===0?'Start optional timer':'Stop timer'}</button><p role="status">{remaining===null?'Wait until breathing is comfortable.':remaining===0?'Done. Resume natural breathing.':`${Math.floor(remaining/60)}:${String(remaining%60).padStart(2,'0')} left${guidance.downshift.inhaleSeconds&&guidance.downshift.exhaleSeconds?` · gently inhale ${guidance.downshift.inhaleSeconds}s, exhale ${guidance.downshift.exhaleSeconds}s`:''}`}</p></GuidanceCard>
    <details className="jmm-panel"><summary><span className="jmm-num">07</span><b>Close the loop</b><span className="jmm-plus" aria-hidden="true">+</span></summary><div className="jmm-panel-body"><p>{guidance.checkIn.items.join(' ')}</p><form onSubmit={submit}><label>Actual minutes<input type="number" min="0" max="1440" value={minutes} onChange={e=>setMinutes(e.target.value===''?'':Number(e.target.value))}/></label><label>Session effort · 1–10<input type="number" min="1" max="10" value={rpe} onChange={e=>setRpe(e.target.value===''?'':Number(e.target.value))}/></label><label>How did it go?<textarea maxLength={1000} value={comments} onChange={e=>setComments(e.target.value)}/></label><button className="jmm-button" type="submit" disabled={busy}>{busy?'Saving…':'Save workout feedback'}</button>{saved&&<p role="status">Workout feedback saved.</p>}</form></div></details>
    <footer className="jmm-foot">Plan revision {session.revision}. Example implementation: values are only personalized when returned by the athlete's authenticated API.</footer>
  </main>;
}
