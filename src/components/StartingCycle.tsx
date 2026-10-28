"use client";
import React, { useState } from "react";
import { isStartingCycle, type startingCycle } from "@/lib/starting-cycle";

type Preview = {preview:ReturnType<typeof startingCycle>;previewToken:string;existingPlanId:string|null;renewingStartingWeek?:boolean};
export function StartingCycle({es,onSaved,disabled=false,onBusy}:{es:boolean;onSaved:()=>void|Promise<void>;disabled?:boolean;onBusy?:(value:boolean)=>void}) {
  const [preview,setPreview]=useState<Preview|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState(""),[saved,setSaved]=useState("");
  const say=(en:string,spanish:string)=>es?spanish:en;
  async function run(save=false){
    if(busy||disabled)return;setBusy(true);onBusy?.(true);setError("");setSaved("");
    try {
      const response=await fetch("/api/plan/starting",save?{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({confirmed:true,previewToken:preview?.previewToken})}:{cache:"no-store"});
      const data=await response.json();if(!response.ok||data.ok!==true)throw Error(data.error||say("Could not verify the plan.","No se pudo verificar el plan."));
      if(save){if(typeof data.planId!=="string")throw Error(say("Save could not be verified.","No se pudo verificar el guardado."));setPreview(null);setSaved(say("Starting week saved. Exercise still needs the current safety check; no device delivery was requested.","Semana inicial guardada. El ejercicio sigue pendiente de la revisión de seguridad; no se solicitó ningún envío al dispositivo."));await onSaved();}
      else {if(!isStartingCycle(data.preview)||typeof data.previewToken!=="string"||!/^[a-f0-9]{64}$/.test(data.previewToken)||(data.existingPlanId!==null&&typeof data.existingPlanId!=="string"))throw Error(say("The starting-week response could not be verified. Try again.","No se pudo verificar la semana inicial. Inténtalo de nuevo."));setPreview(data);}
    }catch(e){setError((e as Error).message);}finally{setBusy(false);onBusy?.(false);}
  }
  return <section aria-label={say("Start with available information","Empezar con los datos disponibles")} className="rounded-xl border border-ocean-200 bg-ocean-50/50 p-4 space-y-3">
    <h3 className="font-semibold">{say("Start with what you know","Empieza con lo que sabes")}</h3>
    <p className="text-sm">{say("No device or performance test is required to review a starting week. Missing information stays unknown. This does not replace a personalized cycle or authorize exercise through a safety hold.","No necesitas dispositivo ni prueba de rendimiento para revisar una semana inicial. Lo que falta sigue sin confirmar. Esta semana no sustituye un ciclo personalizado ni autoriza ejercicio durante una pausa de seguridad.")}</p>
    <button className="btn-secondary" type="button" disabled={busy||disabled} onClick={()=>void run()}>{busy?say("Preparing…","Preparando…"):say("Preview my starting week","Ver mi semana inicial")}</button>
    {error&&<p role="alert" className="text-red-700">{error}</p>}{saved&&<p role="status">{saved}</p>}
    {preview&&<div role="region" aria-label={say("Starting-week preview","Vista previa de la semana inicial")} className="space-y-3">
      {preview.existingPlanId?<p>{say("You already have an active plan. Review it before replacing anything.","Ya tienes un plan activo. Revísalo antes de sustituirlo.")}</p>:<>
        {preview.renewingStartingWeek&&<p>{say("Your previous starting week has ended. Saving archives that week and keeps its reported history; no progression is assumed.","La semana inicial anterior terminó. Al guardar se archiva esa semana y se conserva el historial informado; no se supone una progresión.")}</p>}
        <p className="text-sm">{say("Suggested schedule for your review, not assumed availability. Up to three optional, comfortable observations; no progression or invented benchmarks. Record actual minutes, effort and recovery before choosing the next cycle.","Horario propuesto para que lo revises, no disponibilidad supuesta. Hasta tres observaciones cómodas opcionales, sin progresión ni referencias inventadas. Registra minutos reales, esfuerzo y recuperación antes de elegir el siguiente ciclo.")}</p>
        {preview.preview.reasons.length>0&&<div role="status"><strong>{say("Review tasks only; no exercise prescribed","Solo tareas de revisión; no se prescribe ejercicio")}</strong><ul className="list-disc pl-5">{preview.preview.reasons.map(reason=><li key={reason.key}>{es?reason.es:reason.en}</li>)}</ul><a className="underline" href="/onboard?redo=1&advanced=1&step=race&return=training">{say("Review my answers and restrictions","Revisar mis respuestas y restricciones")}</a></div>}
        <ul className="text-sm space-y-2">{preview.preview.days.map(day=><li key={day.dateKey}><strong>{day.dateKey}</strong> · {day.kind==="existing_record"?say("Existing activity/event protected; no extra session","Actividad/evento existente protegido; sin sesión adicional"):day.kind==="review"?say("Review readiness and missing information","Revisar preparación y datos pendientes"):day.kind==="observation"&&day.minutes>0?`${day.minutes} min · ${say("optional comfortable observation, pending daily check-in","observación cómoda opcional, pendiente del check-in diario")}`:say("Open day; record only what you do","Día libre; registra solo lo que hagas")}</li>)}</ul>
        <div className="flex flex-wrap gap-2"><button type="button" className="btn-primary" disabled={busy||disabled} onClick={()=>void run(true)}>{say("Confirm and save starting week","Confirmar y guardar semana inicial")}</button><button type="button" className="btn-secondary" disabled={busy||disabled} onClick={()=>setPreview(null)}>{say("Cancel","Cancelar")}</button></div>
      </>}
    </div>}
  </section>;
}
