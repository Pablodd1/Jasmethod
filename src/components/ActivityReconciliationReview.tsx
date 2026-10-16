"use client";
import React,{useState} from "react";
import type {publicActivityReconciliation} from "@/lib/activity-evidence";
type Summary=ReturnType<typeof publicActivityReconciliation>&{truncated?:boolean};
export function ActivityReconciliationReview({initial,es=false,onSaved}:{initial?:Summary;es?:boolean;onSaved?:()=>void|Promise<void>}) {
  const [current,setCurrent]=useState<Summary|undefined>(),[error,setError]=useState(""),[message,setMessage]=useState(""),[busy,setBusy]=useState(false);
  const summary=current||initial;
  async function refresh(){const r=await fetch("/api/activities/reconcile",{cache:"no-store"});const body=await r.json();if(!r.ok)throw Error(body.error||"Could not load activity review");setCurrent(body);}
  return <section className="space-y-3 border-t pt-3" aria-label={es?"Reconciliar actividades importadas":"Reconcile imported activities"}>
    <h3 className="font-semibold">{es?"Revisar posibles copias de actividades":"Review possible activity copies"}</h3>
    <p className="text-sm">{es?"Los registros de cada proveedor se conservan. Revisa si corresponden a una sesión o a sesiones diferentes; no cambiamos tu capacidad ni tu plan automáticamente.":"Each provider's records are preserved. Review whether these describe one session or separate sessions; your capacity and plan never change automatically."}</p>
    <button type="button" className="btn-secondary min-h-11" disabled={busy} onClick={async()=>{setBusy(true);setError("");try{await refresh();}catch(e){setError((e as Error).message);}finally{setBusy(false);}}}>{es?"Actualizar revisión (180 días)":"Refresh review (180 days)"}</button>
    {summary&&<p className="text-sm">{summary.rawRecords} {es?"registros originales":"source records"} · {summary.groupedCopies} {es?"copias cuentan una vez":"copies counted once"} · {summary.unresolvedGroups} {es?"grupos pendientes":"groups needing review"}</p>}
    {summary?.truncated&&<p role="status">{es?"Solo se muestran 2.000 registros; la revisión está incompleta.":"Only 2,000 records are shown; review coverage is incomplete."}</p>}
    {summary?.reviewedDecisions?.map(choice=><ReopenChoice key={choice.revision} choice={choice} es={es} disabled={busy} onReopen={async()=>{
      setBusy(true);setError("");setMessage("");
      try{const response=await fetch("/api/activities/reconcile",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({kind:"review_again",ids:choice.records.map(r=>r.id),primaryId:null,revision:choice.revision,confirmed:true})});const body=await response.json();if(!response.ok)throw Error(body.error||"Could not reopen your review");await refresh();await onSaved?.();setMessage(es?"Revisión reabierta. Elige de nuevo; no se ha cambiado ni eliminado ningún registro. Completa un nuevo check-in después de confirmar.":"Review reopened. Choose again; no source record or earlier audit was changed or deleted. Complete a fresh check-in after confirming.");}catch(e){setError((e as Error).message);}finally{setBusy(false);}
    }}/>) }
    {summary?.pending.map(group=><ReconciliationChoice key={group.revision} group={group} es={es} disabled={busy} onSubmit={async(kind,primaryId,ids)=>{setBusy(true);setError("");setMessage("");try{
      const r=await fetch("/api/activities/reconcile",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({kind,primaryId,ids,revision:group.revision,confirmed:true})});const body=await r.json();if(!r.ok)throw Error(body.error||"Could not save your review");
      await refresh();await onSaved?.();setMessage(es?"Decisión guardada; registros originales intactos. Envía un nuevo check-in antes de entrenar.":"Decision saved; source records unchanged. Submit a fresh check-in before training.");
    }catch(e){setError((e as Error).message);}finally{setBusy(false);}}}/>)}
    {summary?.decisions.map(group=><p className="text-xs" key={group.records.map(r=>r.id).join(":")}>{group.selection==="athlete_confirmed"?(es?"Una sesión confirmada por ti":"One session confirmed by you"):(es?"Copias corroboradas o vinculadas; no es validación del dispositivo":"Corroborated copies or linked reports; not device validation")}: {group.records.map(r=>`${r.source} · ${r.minutes??"—"} min · RPE ${r.reportedRpe??"—"}/10`).join(" / ")} · {es?"Registro que cuenta":"Record counted"}: {group.records.find(r=>r.id===group.primaryId)?.source||"—"}</p>)}
    {error&&<p role="alert">{error}</p>}{message&&<p role="status">{message}</p>}
  </section>;
}
function ReopenChoice({choice,es,disabled,onReopen}:{choice:Summary["reviewedDecisions"][number];es:boolean;disabled:boolean;onReopen:()=>Promise<void>}){
  const [confirmed,setConfirmed]=useState(false);
  return <fieldset className="rounded-xl border p-3 space-y-2" disabled={disabled}>
    <legend className="font-medium">{es?"Tu decisión actual":"Your current decision"}: {choice.kind==="same_session"?(es?"Una sesión":"One session"):(es?"Sesiones diferentes":"Separate sessions")}</legend>
    {choice.records.map(r=><p key={r.id} className="text-sm">{r.sport} · {r.source} · {r.startedAt} · {r.minutes??"—"} min · RPE {r.reportedRpe??"—"}/10{r.id===choice.primaryId?(es?" · Registro elegido":" · Selected source"):""}</p>)}
    <p className="text-xs">{es?"Puedes corregir tu elección sin editar datos del proveedor. Al reabrir, la carga queda pendiente hasta confirmar otra decisión y completar un nuevo check-in.":"You can correct your choice without editing provider data. Reopening leaves load unresolved until you confirm a replacement decision and complete a fresh check-in."}</p>
    <label className="flex gap-2 text-sm"><input type="checkbox" checked={confirmed} onChange={e=>setConfirmed(e.target.checked)}/><span>{es?"Quiero reabrir esta decisión para revisarla.":"I want to reopen this decision for review."}</span></label>
    <button type="button" className="btn-secondary min-h-11" disabled={!confirmed||disabled} onClick={()=>void onReopen()}>{es?"Reabrir revisión":"Reopen review"}</button>
  </fieldset>;
}
function ReconciliationChoice({group,es,disabled,onSubmit}:{group:Summary["pending"][number];es:boolean;disabled:boolean;onSubmit:(kind:"same_session"|"different_sessions",primaryId:string|null,ids:string[])=>Promise<void>}){
  const [kind,setKind]=useState(""),[primary,setPrimary]=useState(""),[confirmed,setConfirmed]=useState(false),[chosen,setChosen]=useState<string[]>([]);
  const ids=group.records.length===2?group.records.map(r=>r.id):chosen;
  return <fieldset className="rounded-xl border p-3 space-y-3" disabled={disabled}>
    <legend className="font-medium">{es?"Posibles copias; revisa cada registro":"Possible copies; review each source record"}</legend>
    {group.records.map(record=><p className="text-sm" key={record.id}>{record.sport} · {record.source} · {record.startedAt} · {record.minutes??"—"} min · RPE {record.reportedRpe??"—"}/10 · {record.distanceKm==null?"—":`${record.distanceKm} km`}</p>)}
    {group.records.length>2&&<fieldset><legend>{es?"Elige los registros que estás revisando (dos o más)":"Choose the records you are reviewing (two or more)"}</legend>{group.records.map(r=><label key={r.id} className="flex gap-2 text-sm"><input type="checkbox" checked={chosen.includes(r.id)} onChange={e=>{setChosen(prior=>e.target.checked?[...prior,r.id]:prior.filter(id=>id!==r.id));setPrimary("");setConfirmed(false);}}/>{r.source} · {r.minutes??"—"} min · RPE {r.reportedRpe??"—"}/10 · {r.startedAt}</label>)}</fieldset>}
    <label className="block text-sm">{es?"¿Qué ocurrió?":"What happened?"}<select className="input" value={kind} onChange={e=>{setKind(e.target.value);setConfirmed(false);}}><option value="">{es?"Elige después de revisar":"Choose after reviewing"}</option><option value="same_session">{es?"Es una sesión registrada varias veces":"One session recorded more than once"}</option><option value="different_sessions">{es?"Son sesiones diferentes; conserva todas":"Separate sessions; count each"}</option></select></label>
    {kind==="same_session"&&<label className="block text-sm">{es?"Elige el registro real que debe contar (sin promediar ni combinar mediciones)":"Choose the actual record to count (no averaging or combining measurements)"}<select className="input" value={primary} onChange={e=>{setPrimary(e.target.value);setConfirmed(false);}}><option value="">{es?"Elige un registro":"Choose a source record"}</option>{group.records.filter(r=>ids.includes(r.id)).map(r=><option key={r.id} value={r.id}>{r.source} · {r.minutes??"—"} min · RPE {r.reportedRpe??"—"}/10 · {r.startedAt}</option>)}</select></label>}
    <label className="flex gap-2 text-sm"><input type="checkbox" checked={confirmed} onChange={e=>setConfirmed(e.target.checked)}/><span>{es?"He revisado estos registros y confirmo mi elección.":"I reviewed these records and confirm my choice."}</span></label>
    <button type="button" className="btn-secondary min-h-11" disabled={ids.length<2||!confirmed||!kind||(kind==="same_session"&&!primary)||disabled} onClick={()=>void onSubmit(kind as "same_session"|"different_sessions",kind==="same_session"?primary:null,ids)}>{es?"Guardar esta decisión":"Save this decision"}</button>
  </fieldset>;
}
