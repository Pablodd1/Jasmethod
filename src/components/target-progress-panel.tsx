"use client";

import { useEffect, useState, useCallback } from "react";
import type { ProgressComparison, ProgressSource, TargetProgress } from "@/lib/target-progress";
interface ProgressState {progress:TargetProgress;revision:string;setupRevision:string|null;planningReadiness:{ready:boolean;missing:string[];review:string[];targetReview?:string[];planningBasis?:string}}
const number = (v:number) => new Intl.NumberFormat(undefined,{maximumFractionDigits:3}).format(v);
export function TargetProgressPanel({language="en"}:{language?:string}) {
  const es=language==="es", t=(en:string,sp:string)=>es?sp:en;
  const [state,setState]=useState<ProgressState|null>(null), [loading,setLoading]=useState(true), [saving,setSaving]=useState(false), [error,setError]=useState(""), [status,setStatus]=useState("");
  const [form,setForm]=useState({value:"",unit:"",observedAt:"",contextConfirmed:false,note:"",supersedesId:""});
  const load = useCallback(async (signal?:AbortSignal) => {
    setLoading(true);
    try {
      const r=await fetch("/api/target-progress",{cache:"no-store",signal}), data=await r.json();
      if (!r.ok) throw Error(data.error||(es ? "No se pudo cargar la evidencia" : "Could not load target evidence"));
      if (!signal?.aborted) {setState(data);setError("");}
    } catch(e) {if (!signal?.aborted) setError((e as Error).message);} finally {if (!signal?.aborted) setLoading(false);}
  }, [es]);
  useEffect(()=>{const controller=new AbortController();void load(controller.signal);return ()=>controller.abort();},[load]);
  async function save(e:React.FormEvent) {
    e.preventDefault();if (!state || saving) return;setSaving(true);setError("");setStatus("");
    try {
      const r=await fetch("/api/target-progress",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({...form,supersedesId:form.supersedesId||undefined,expectedRevision:state.revision,expectedSetupRevision:state.setupRevision})}), data=await r.json();
      if (!r.ok) throw Error(data.error||t("Could not save result", "No se pudo guardar el resultado"));
      setForm({value:"",unit:"",observedAt:"",contextConfirmed:false,note:"",supersedesId:""});
      setStatus(t("Report saved separately. No capacity anchor or workout changed.","Informe guardado por separado. No se modificó ninguna referencia de capacidad ni sesión."));await load();
    } catch(e) {setError((e as Error).message);} finally {setSaving(false);}
  }
  const source=(s:ProgressSource)=>s==="athlete_reported"?t("Athlete-reported","Informado por atleta"):s==="coach_entered"?t("Coach-entered report","Informe introducido por entrenador"):t("Saved benchmark; source unverified","Prueba guardada; fuente no verificada");
  const reasonText=(reason:string|null) => {
    if (!es || !reason) return reason;
    if (reason.startsWith("No numeric target")) return "No se eligió un objetivo numérico. No se infiere bienestar físico ni finalización de una cifra de rendimiento.";
    if (reason.startsWith("Choose the target")) return "Elige el contexto de prueba o medición del objetivo antes de comparar resultados distintos.";
    if (reason.startsWith("No completed benchmark")) return "Ninguna prueba completada coincide con el deporte, métrica y contexto. No se sustituyen otros deportes ni estimaciones de umbral.";
    if (reason.startsWith("No manual report")) return "Ningún informe manual coincide con el deporte y contexto de medición del objetivo.";
    if (reason.startsWith("Matching evidence is stale")) return "La evidencia compatible tiene más de 90 días, fecha futura o datos inválidos. Informa un resultado reciente solo si es seguro; no se requiere prueba para un plan basado en tu entrenamiento actual.";
    return reason;
  };
  const contextLabel=(value:string) => ({run5k:t("5 km average", "Promedio en 5 km"),ftp:t("Cycling FTP", "FTP de ciclismo"),swim_threshold:t("Swim threshold / CSS", "Umbral de natación / CSS"),custom:t("Custom context", "Contexto personalizado")} as Record<string,string>)[value]??value;
  function comparison(value:ProgressComparison|null,reason:string|null) {
    if (!value) return <p>— {reasonText(reason)}</p>;
    return <div className="space-y-1"><p className="font-semibold">{number(value.currentValue)} {value.unit}</p>
      <p>{source(value.observation.source)} · {value.observation.observedAt.slice(0,10)} · {contextLabel(value.observation.context)}</p>
      <p>{value.status==="at_or_beyond_target"?t("This reported value is at or beyond the target in the selected context. This does not establish sustainable capacity.","Este valor informado alcanza o supera la meta en el contexto elegido. No establece capacidad sostenible."):`${t("Arithmetic gap to target", "Diferencia aritmética respecto al objetivo")}: ${number(value.remainingGap)} ${value.unit}`}</p>
      {value.observation.formula&&<p>{t(value.observation.formula,"Segundos totales en 5 km / 5; conversión exacta del promedio de distancia, no estimación del umbral")}</p>}
      <p className="text-xs">{t("Source record", "Registro fuente")}: {value.observation.id} · {t("Entered", "Introducido")}: {value.observation.enteredAt?.slice(0,10)??t("unknown", "desconocido")}</p>
    </div>;
  }
  const p=state?.progress,target=p?.target;
  return <section className="card space-y-4" aria-labelledby="target-progress-heading">
    <div className="flex flex-wrap justify-between gap-2"><h2 id="target-progress-heading" className="font-display font-bold text-lg">{t("Target and reported progress", "Objetivo y progreso informado")}</h2><a className="underline" href="/onboard?redo=1">{t("Edit goal or planning choice", "Editar objetivo o elección del plan")}</a></div>
    {loading&&<p role="status">{t("Loading source evidence…", "Cargando evidencia…")}</p>}
    {error&&<p role="alert">{error} <button className="underline" type="button" disabled={saving||loading} onClick={()=>void load()}>{t("Reload and review", "Recargar y revisar")}</button></p>}
    {status&&<p role="status">{status}</p>}
    {p&&<>
      <p>{target?`${t("Aspiration", "Aspiración")}: ${target.sport} · ${target.value!=null?`${number(target.value)} ${target.unit}`:target.metric}`:t("No structured target saved.", "No hay un objetivo estructurado guardado.")}</p>
      {target&&<><p>{t("Context", "Contexto")}: {target.contextDescription??(target.context?contextLabel(target.context):null)??t("unknown; comparison unavailable", "desconocido; no es posible comparar")}</p>
        <p>{t("Target date", "Fecha objetivo")}: {p.horizon.targetDate??"—"}{p.horizon.daysRemaining!=null && <span> ({p.horizon.state==="past" ? t("past date", "fecha pasada") : `${p.horizon.daysRemaining} ${t("days remaining", "días restantes")}`})</span>} · {t("Chosen plan horizon", "Horizonte del plan elegido")}: {p.planningWeeks??"—"} {t("weeks", "semanas")}</p>
        <p className="text-sm">{t("Goal source", "Fuente del objetivo")}: {p.targetSource==="coach_set"?t("coach-set", "establecido por entrenador"):t("athlete-reported", "informado por atleta")} · {t("Saved", "Guardado")}: {p.targetSavedAt?.slice(0,10)??"—"}</p></>}
      {p.horizon.daysRemaining!=null && p.horizon.daysRemaining>=0 && p.planningWeeks!=null && p.horizon.daysRemaining<p.planningWeeks*7 && <p role="status" className="text-sm">{t("Your target date falls before the end of the chosen plan horizon. A baseline-only plan does not promise to meet that date; discuss target-specific preparation with a qualified coach.","La fecha objetivo cae antes del final del plan elegido. Un plan basado en el nivel actual no promete lograr la meta para esa fecha; consulta la preparación específica con un entrenador cualificado.")}</p>}
      <div className="grid md:grid-cols-2 gap-4 text-sm"><div className="rounded-lg border p-3 space-y-2"><h3 className="font-semibold">{t("Matching benchmark reference", "Referencia de prueba compatible")}</h3>{comparison(p.benchmark,p.benchmarkReason)}</div><div className="rounded-lg border p-3 space-y-2"><h3 className="font-semibold">{t("Separate manual report", "Informe manual separado")}</h3>{comparison(p.reported,p.reportedReason)}</div></div>
      <p className="text-sm">{t("Comparisons require the same sport and test context, with evidence from the last 90 days. This is a pilot freshness policy, not a validity guarantee. No device or maximal test is required.", "Las comparaciones exigen el mismo deporte y contexto de prueba, con evidencia de los últimos 90 días. Es una regla de vigencia del piloto, no una garantía de validez. No se requiere dispositivo ni prueba máxima.")}</p>
      {p.limitations.length > 3 && <p role="status">{t(p.limitations[3],"Hay informes guardados que no se pudieron validar y se excluyeron. No se inventó ningún resultado sustituto.")}</p>}
      <p className="text-sm">{t("The target and arithmetic gap are not a forecast, probability or promised date of success. A baseline-only plan uses recent tolerated training and is not optimized to reach this target. Target-driven progression requires coaching review.","El objetivo y la diferencia aritmética no son un pronóstico, probabilidad ni fecha prometida de éxito. Un plan basado en el nivel actual usa el entrenamiento reciente tolerado y no está optimizado para lograr esta meta. La progresión dirigida a la meta requiere revisión profesional.")}</p>
      {state?.planningReadiness.planningBasis==="baseline_only"&&<p className="text-sm">{t("Baseline-only planning explicitly selected. Safety, restrictions and recent-training requirements still apply.","Se eligió explícitamente el plan basado en el nivel actual. Siguen vigentes los requisitos de seguridad, restricciones y entrenamiento reciente.")}</p>}
      {target?.value!=null&&target.context&&<details><summary className="cursor-pointer font-semibold">{t("Record an optional manual result", "Registrar un resultado manual opcional")}</summary><form className="mt-3 space-y-3" onSubmit={save}>
        <p className="text-sm">{t("Report an existing result only. This does not ask you to perform a test, update a capacity anchor, or change a workout. Use decimal minutes (5.5 = 5:30), not minute.second notation.","Informa solo de un resultado existente. No te pide hacer una prueba, actualizar una referencia de capacidad ni cambiar una sesión. Usa minutos decimales (5,5 = 5:30), no notación minuto.segundo.")}</p>
        {form.supersedesId&&<p role="status">{t("Correcting report", "Corrigiendo informe")}: {form.supersedesId}. {t("The original stays in history.", "El original se conserva en el historial.")} <button className="underline" type="button" onClick={()=>setForm({...form,supersedesId:""})}>{t("Cancel correction", "Cancelar corrección")}</button></p>}
        <div className="grid sm:grid-cols-3 gap-3"><label>{t("Reported value", "Valor informado")}<input className="input" type="number" min="0.000001" step="any" required value={form.value} onChange={e=>setForm({...form,value:e.target.value})}/></label><label>{t("Units", "Unidades")}<select className="input" required value={form.unit} onChange={e=>setForm({...form,unit:e.target.value})}><option value="">{t("Select", "Seleccionar")}</option>{(target.metric==="power"?["W"]:["sec/km","min/km","sec/mi","min/mi","sec/100m","min/100m","sec/100yd","min/100yd","km/h","mph","m/s"]).map(u=><option key={u} value={u}>{u}</option>)}</select></label><label>{t("Observation date", "Fecha de observación")}<input className="input" type="date" required value={form.observedAt} onChange={e=>setForm({...form,observedAt:e.target.value})}/></label></div>
        <label className="block">{t("Conditions / correction reason", "Condiciones / motivo de corrección")}<textarea className="input" maxLength={1000} required={Boolean(form.supersedesId)} value={form.note} onChange={e=>setForm({...form,note:e.target.value})}/></label>
        <label className="flex gap-2"><input type="checkbox" required checked={form.contextConfirmed} onChange={e=>setForm({...form,contextConfirmed:e.target.checked})}/><span>{t("I confirm this result uses the target's sport and measurement context shown above.","Confirmo que este resultado usa el deporte y contexto de medición del objetivo mostrado arriba.")}</span></label>
        <button className="btn-primary" disabled={saving||loading} type="submit">{saving?t("Saving…", "Guardando…"):t("Save separate report", "Guardar informe separado")}</button>
      </form></details>}
      {p.observations.length>0&&<details><summary className="cursor-pointer">{t("Recent source records (contexts may differ)", "Registros recientes (los contextos pueden ser distintos)")}</summary><ul className="mt-2 space-y-3 text-sm">{p.observations.slice(0,20).map(o=><li key={`${o.sourceRecord}-${o.id}`}>{o.observedAt.slice(0,10)} · {o.sport} · {o.contextDescription??contextLabel(o.context)} · {number(o.value)} {o.unit} · {source(o.source)}{p.supersededIds.includes(o.id)&&` · ${t("superseded by correction", "sustituido por corrección")}`}{o.note&&<p>{o.note}</p>}{o.sourceRecord==="manual_report"&&!p.supersededIds.includes(o.id)&&target?.sport===o.sport&&target.metric===o.metric&&target.context===o.context&&target.contextDescription===o.contextDescription&&<button type="button" className="underline ml-2" onClick={()=>setForm({value:String(o.value),unit:o.unit,observedAt:o.observedAt.slice(0,10),contextConfirmed:false,note:"",supersedesId:o.id})}>{t("Select to correct in the form above", "Seleccionar para corregir en el formulario superior")}</button>}</li>)}</ul></details>}
    </>}
  </section>;
}
