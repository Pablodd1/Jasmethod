"use client";
import dynamic from "next/dynamic";
import Link from "next/link";
import { StartingCycle } from "@/components/StartingCycle";
import { planningReasonText } from "@/lib/planning-reason-copy";
import { addDaysKey } from "@/lib/dates";
import { endpointText } from "@/lib/universal-workout-card";
import React, { Suspense, useEffect, useRef, useState } from "react";
import { commanderDraft, type CommanderArea, type CommanderReceipt } from "@/lib/coach-commander";
import type { CoachMessage } from "./coach-conversation-client";
const Setup = dynamic(()=>import("@/components/detailed-athlete-setup").then(m=>m.DetailedAthleteSetup));
const Workout = dynamic(()=>import("./UniversalWorkoutCard").then(m=>m.UniversalWorkoutCardLoader));
type State={localToday:string;readiness:{ready:boolean;missing:string[];review:string[]};defaults:{distance:string|null;weeks:number|null;easyPct:number|null;trainingWindow:string|null};activePlans:{id:string;name:string}[];receipt:CommanderReceipt|null};
type Week={week:number;theme:string;totalMinutes:number;sessions:{daySlot:number;title:string;sport:string;minutes:number;zone:string;description:string;startTime?:string;steps?:{name:string;seconds:number;zone:string}[]}[]};
type Preview={previewToken:string;warning:string;doubleDayAgreementRequired:boolean;eventTradeoffAgreementRequired:boolean;preview:{startDate:string;startDateKey?:string;timezone?:string;weeks:number;weeklyBudgetMin:number;weeksPreview:Week[];cycle?:{assessment?:string;events?:{warnings?:{message:string}[]}}}};
const button="btn-secondary min-h-11 whitespace-normal";
export function CoachCommanderWorkspace({athleteId,es,messages,sessionId,disabled,onSaved,onBusy}:{athleteId:string;es:boolean;messages:CoachMessage[];sessionId:string;disabled:boolean;onSaved:()=>void|Promise<void>;onBusy:(busy:boolean)=>void}) {
  const [area,setArea]=useState<CommanderArea|null>(null),[state,setState]=useState<State|null>(null),[preview,setPreview]=useState<Preview|null>(null);
  const [weeks,setWeeks]=useState(""),[start,setStart]=useState(""),[easy,setEasy]=useState(""),[window,setWindow]=useState("");
  const [error,setError]=useState(""),[busy,setBusy]=useState(false),[uncertain,setUncertain]=useState(false),[double,setDouble]=useState(false),[events,setEvents]=useState(false);
  const [receipt,setReceipt]=useState<CommanderReceipt|null>(null),[source,setSource]=useState<string|null>(null);
  const seen=useRef<string|null>(null),hydrated=useRef(false),inFlight=useRef(false),mounted=useRef(true),epoch=useRef(0);
  useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;};},[]);
  useEffect(()=>{setState(null);setPreview(null);setReceipt(null);setSource(null);setWeeks("");setStart("");setEasy("");setWindow("");setError("");setUncertain(false);seen.current=null;hydrated.current=false;epoch.current++;},[athleteId]);
  useEffect(()=>{
    const latest=[...messages].reverse().find(m=>m.role==="user");
    if(!hydrated.current){if(disabled)return;hydrated.current=true;seen.current=latest?.id??null;return;}
    if(!latest){setSource(null);setPreview(null);return;}
    if(seen.current===latest.id)return;seen.current=latest.id;
    const draft=commanderDraft(latest.content);if(!draft)return;
    if(draft.area!=="plan"||!/\b(?:plan|cycle|ciclo)\b/i.test(latest.content)||!/\b(?:build|create|generate|revise|replace|change|want|make|crea|genera|cambia|quiero|prepara)\b/i.test(latest.content))return;
    setSource(latest.id);setArea(draft.area);setPreview(null);setDouble(false);setEvents(false);
    if(draft.weeks!==undefined)setWeeks(String(draft.weeks));if(draft.startDate)setStart(draft.startDate);
    setError(draft.questions.length?(es?"Revisa las semanas y la fecha de inicio; no se han supuesto valores.":draft.questions.join(" ")):"");
  },[messages,es,disabled]);
  async function readState() {
    const ticket=++epoch.current;
    try {
      const res=await fetch("/api/assistant/plan",{cache:"no-store",signal:AbortSignal.timeout(15000)});const data=await res.json();
      if(!res.ok||data.ok!==true||!data.readiness||!data.defaults||!Array.isArray(data.activePlans))throw Error(data.error||"Could not verify saved planning context");
      if(!mounted.current||ticket!==epoch.current)return;
      setState(data);setReceipt(data.receipt);setWeeks(v=>v||String(data.defaults.weeks??""));setStart(v=>v||data.localToday);setEasy(v=>v||String(data.defaults.easyPct??""));setWindow(v=>v||data.defaults.trainingWindow||"");
      setUncertain(false);
    }catch(cause){if(mounted.current&&ticket===epoch.current)setError((cause as Error).message);}
  }
  useEffect(()=>{if(area==="plan")void readState();},[area,athleteId]); // Reload only on an explicit workspace/account change, never over a draft.
  const planningReasons=state?[...state.readiness.review,...state.readiness.missing]:[];
  const edit=()=>{setPreview(null);setDouble(false);setEvents(false);setError("");};
  async function run(confirm:boolean) {
    if(inFlight.current||disabled||!state||!state.readiness.ready||uncertain||confirm&&!preview)return;
    if(!weeks||!start){setError(es?"Elige semanas y fecha de inicio.":"Choose planning weeks and start date.");return;}
    inFlight.current=true;setBusy(true);onBusy(true);setError("");
    const ticket=++epoch.current;
    try {
      const res=await fetch("/api/assistant/plan",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:confirm?"confirm":"preview",weeks:Number(weeks),startDate:start,...(easy?{easyPct:Number(easy)}:{}),...(window?{trainingWindow:window}:{}),sourceMessageId:source,...(confirm?{previewToken:preview!.previewToken,confirmDoubleDay:double,confirmEventTradeoffs:events}:{})}),signal:AbortSignal.timeout(60000)});
      const data=await res.json();
      if(!res.ok||data.ok!==true)throw Error(data.error||"The planner could not verify this request");
      if(!mounted.current||ticket!==epoch.current)return;
      if(confirm){
        if(!data.receipt?.id||data.receipt.previewToken!==preview!.previewToken||!data.receipt.planId)throw Error("A matching plan-save receipt was not returned");
        setReceipt(data.receipt);setState(current=>current?{...current,activePlans:[{id:data.receipt.planId,name:data.receipt.name}]}:current);setPreview(null);await onSaved();
      }else{
        if(!/^[a-f0-9]{64}$/.test(data.previewToken)||!Array.isArray(data.preview?.weeksPreview))throw Error("A complete reviewable plan preview was not returned");
        setPreview(data);setDouble(false);setEvents(false);
      }
    }catch(cause){if(mounted.current&&ticket===epoch.current){setError((cause as Error).message);if(confirm)setUncertain(true);setPreview(null);}}
    finally{inFlight.current=false;if(mounted.current)setBusy(false);onBusy(false);}
  }
  return <section className="rounded-xl border border-ocean-200 p-3 space-y-3" aria-label={es?"Comandos y revisión del coach":"Coach commands and review"}>
    <h3 className="font-semibold">{es?"Revisar y actuar aquí":"Review and act here"}</h3>
    <p className="text-sm">{es?"La conversación prepara el siguiente paso. Revisa los datos y confirma cada guardado; las aprobaciones y los límites se mantienen.":"Keep the conversation open while reviewing facts, scheduling and training. Each save needs your explicit review; existing approvals and limits still apply."}</p>
    <div className="flex flex-wrap gap-2">{([['plan','Plan preview','Vista previa del plan'],['profile','Profile & schedule','Perfil y horario'],['race','Race & venue','Carrera y sede'],['session','Workout steps','Pasos de la sesión']] as const).map(([key,en,sp])=><button type="button" key={key} className={button} aria-pressed={area===key} disabled={disabled||busy} onClick={()=>setArea(area===key?null:key)}>{es?sp:en}</button>)}</div>
    {area&&<button type="button" className="underline text-sm" disabled={busy} onClick={()=>setArea(null)}>{es?"Cerrar revisión; conservar conversación":"Close review; keep conversation"}</button>}
    {area==="plan"&&<div className="space-y-3">
      {!state&&<p role="status">{es?"Cargando tu contexto guardado…":"Loading your saved planning context…"}</p>}
      {state&&!state.readiness.ready&&<div role="status"><p>{es?"Datos que faltan o necesitan revisión para un ciclo personalizado:":"Missing information or review needed for a personalized cycle:"}</p><p>{planningReasons[0]&&planningReasonText(planningReasons[0],es)}</p><details><summary className="cursor-pointer underline">{es?"Ver todos los datos pendientes":"Review all pending information"} ({planningReasons.length})</summary><ul className="list-disc pl-5">{planningReasons.map(item=><li key={item}>{planningReasonText(item,es)}</li>)}</ul></details><button className={button} type="button" disabled={disabled||busy} onClick={()=>setArea("profile")}>{es?"Revisar datos aquí":"Review answers here"}</button><StartingCycle key={athleteId} es={es} disabled={disabled||busy} onBusy={value=>{setBusy(value);onBusy(value);}} onSaved={async()=>{await readState();await onSaved();}}/></div>}
      {state&&<><p className="text-sm">{es?"Objetivo guardado":"Saved goal"}: {state.defaults.distance??"—"}. {es?"Plan actual":"Current plan"}: {state.activePlans.map(plan=>plan.name).join("; ")||"—"}</p>
        <div className="grid gap-3 sm:grid-cols-2"><label>{es?"Semanas (4–30)":"Weeks (4–30)"}<input className="input w-full" type="number" min="4" max="30" value={weeks} disabled={busy||disabled} onChange={e=>{edit();setWeeks(e.target.value);}}/></label><label>{es?"Fecha de inicio local":"Local start date"}<input className="input w-full" type="date" min={state.localToday} value={start} disabled={busy||disabled} onChange={e=>{edit();setStart(e.target.value);}}/></label><label>{es?"Distribución fácil planificada (%)":"Planned easy allocation (%)"}<input className="input w-full" type="number" min="45" max="90" value={easy} placeholder={es?"Política del plan si no se indica":"Planner policy if omitted"} disabled={busy||disabled} onChange={e=>{edit();setEasy(e.target.value);}}/></label><label>{es?"Horario preferido":"Preferred window"}<select className="input w-full" value={window} disabled={busy||disabled} onChange={e=>{edit();setWindow(e.target.value);}}><option value="">{es?"Usar preferencia guardada":"Use saved preference"}</option><option value="any">{es?"Sin hora fija":"No fixed time"}</option><option value="morning">{es?"Mañana":"Morning"}</option><option value="midday">{es?"Mediodía":"Midday"}</option><option value="evening">{es?"Tarde":"Evening"}</option></select></label></div>
        <p className="text-xs">{es?"El contexto y la generación se revisan dentro de JMM. Una sesión futura sigue siendo provisional; guardar no autoriza ejercicio ni confirma entrega al reloj.":"Planning and evidence checks run inside JMM. Future training remains provisional; saving a cycle does not clear exercise or confirm watch delivery. The default planned easy allocation is 70% when none is supplied; this is a planning policy, not measured time in zones."}</p>
        <button type="button" className="btn-primary" disabled={disabled||busy||uncertain||!state.readiness.ready} onClick={()=>void run(false)}>{busy?(es?"Comprobando…":"Checking…"):(es?"Preparar vista previa aquí":"Prepare plan preview here")}</button></>}
      {preview&&<section className="rounded-lg border p-3 space-y-3" aria-label={es?"Plan propuesto sin guardar":"Proposed plan, not saved"}><h4 className="font-semibold">{es?"Plan propuesto · sin guardar":"Proposed plan · not saved"}</h4><p>{preview.warning}</p>{preview.preview.cycle?.assessment&&<p>{preview.preview.cycle.assessment}</p>}
        {preview.preview.cycle?.events?.warnings?.map((warning,index)=><p role="status" key={index}>{warning.message}</p>)}
        {preview.preview.weeksPreview.map((week,index)=><details key={index} className="border rounded p-2"><summary className="cursor-pointer">{es?"Semana":"Week"} {index+1}: {week.theme} · {week.totalMinutes} min</summary><ul className="mt-2 space-y-2">{week.sessions.map((session,i)=><li key={i}><strong>{session.title}</strong> · {session.sport} · {session.minutes} min · {session.zone} · {addDaysKey(preview.preview.startDateKey??start,index*7+session.daySlot)} {preview.preview.timezone??""}{session.startTime?` · ${session.startTime}`:""}<p>{session.description}</p>{session.steps?.map((step,s)=><p className="text-xs" key={s}>{step.name} · {endpointText({endpoint:{type:"time",seconds:step.seconds}},es?"es":"en")} · {step.zone}</p>)}</li>)}</ul></details>)}
        {preview.eventTradeoffAgreementRequired&&<label className="flex gap-2"><input type="checkbox" disabled={busy||disabled} checked={events} onChange={e=>setEvents(e.target.checked)}/>{es?"Revisé los conflictos de eventos y acepto este plan conservador.":"I reviewed the event conflicts and accept this conservative event-limited plan."}</label>}
        {preview.doubleDayAgreementRequired&&<label className="flex gap-2"><input type="checkbox" disabled={busy||disabled} checked={double} onChange={e=>setDouble(e.target.checked)}/>{es?"Revisé las fechas y horarios de ambas sesiones y acepto las parejas opcionales, con informe y nuevo check-in entre ellas.":"I reviewed both sessions, dates and times and agree to optional pairs, reporting the first and completing a fresh check-in before the second."}</label>}
        <div className="flex flex-wrap gap-2"><button type="button" className="btn-primary" disabled={disabled||busy||preview.doubleDayAgreementRequired&&!double||preview.eventTradeoffAgreementRequired&&!events} onClick={()=>void run(true)}>{es?"Confirmar y guardar este plan":"Confirm and save this plan"}</button><button type="button" className={button} disabled={busy} onClick={edit}>{es?"Cancelar propuesta":"Cancel proposal"}</button></div></section>}
      {receipt&&<div role="status" className="rounded-lg bg-green-50 p-3 break-words"><strong>{es?"Comprobante de plan guardado":"Saved plan receipt"}</strong><p>{receipt.name} · {receipt.savedAt}</p><p className="text-xs">{receipt.id} · {receipt.planId}</p><p>{es?"Este comprobante es histórico; revisa el plan actual y el check-in antes de entrenar.":"This receipt records that save. Review the current plan and check-in before training."}</p><Link className="underline" href="/training">{es?"Ver ciclo guardado":"View saved cycle"}</Link></div>}
      <button type="button" className={button} disabled={busy||disabled} onClick={()=>{setPreview(null);setError("");void readState();}}>{es?"Recargar contexto y comprobante":"Reload context and receipt"}</button>
    </div>}
    {(area==="profile"||area==="race")&&<Suspense fallback={<p role="status">{es?"Cargando editor…":"Loading editor…"}</p>}><Setup key={area} embedded initialSection={area==="race"?"race":"profile"} onSaved={async()=>{setPreview(null);await onSaved();}}/></Suspense>}
    {area==="session"&&(sessionId?<Workout sessionId={sessionId} es={es} onSaved={onSaved}/>:<p role="status">{es?"Elige la sesión sobre la que hablas.":"Choose the workout you are discussing above. No session is inferred."}</p>)}
    {error&&<p role="alert" className="rounded bg-red-50 p-3 text-red-800">{error}</p>}
    {uncertain&&<p role="status">{es?"El resultado del guardado no está confirmado. Recarga el comprobante y el plan antes de volver a confirmar.":"The save outcome is unconfirmed. Reload the receipt and saved plan before confirming again."}</p>}
  </section>;
}
