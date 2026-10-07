"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { ProtectedPage } from "./gate";
import { useAuth } from "./auth";
import { pilotProfilePatch } from "@/lib/pilot-profile";
import { saveReviewedProfile } from "@/lib/profile-client";

type Provider={id:string;name:string;description:string;configured:boolean;method:string;connectUrl?:string;status:string;lastSyncAt?:string|null;lastError?:string|null};
type Review={suggestions?:{observationId:string;field:"weightKg";value:number;unit:string;source:string;observedAt:string;kind:string}[];history?:{count:number;earliestAt:string|null;latestAt:string|null;sports:{sport:string;count:number}[]};limitations?:string[]};
export function PilotOnboarding(){
  const {user,refresh}=useAuth(),router=useRouter(),query=useSearchParams();
  const es=user?.language==="es",t=(en:string,sp:string)=>es?sp:en;
  const [step,setStep]=useState(query.get("step")==="profile"?"profile":"devices");
  const [providers,setProviders]=useState<Provider[]>([]),[review,setReview]=useState<Review>({});
  const [error,setError]=useState(""),[importError,setImportError]=useState(""),[busy,setBusy]=useState(false),[loading,setLoading]=useState(true);
  const [revision,setRevision]=useState<string|null>(null),[sex,setSex]=useState(""),[weight,setWeight]=useState("");
  const savedBasics=useRef({sex:"",weight:""});
  const [observationId,setObservationId]=useState<string|null>(null);
  const [dirty,setDirty]=useState(false),redo=query.get("redo")==="1";
  const refreshImports=useCallback(async()=>{
    setImportError("");
    try{
      const responses=await Promise.all([fetch("/api/connectors",{cache:"no-store",signal:AbortSignal.timeout(15000)}),fetch("/api/onboard/import-review",{cache:"no-store",signal:AbortSignal.timeout(15000)})]);
      if(responses.some(r=>!r.ok))throw Error("Could not load imports. Continue without a device and retry later.");
      const [connections,imported]=await Promise.all(responses.map(r=>r.json()));setProviders(connections.providers??[]);setReview(imported);
    }catch(e){setImportError((e as Error).message);}
  },[]);
  useEffect(()=>{
    if(!user?.id)return;
    if(user.onboarded===true&&!redo){router.replace("/today");return;}
    let active=true;setLoading(true);
    fetch("/api/profile",{cache:"no-store",signal:AbortSignal.timeout(15000)}).then(async r=>{
      const d=await r.json();if(!r.ok)throw Error(d.error||"Could not load your saved profile.");
      if(active){savedBasics.current={sex:d.profile?.sex??"",weight:d.profile?.weightKg==null?"":String(d.profile.weightKg)};setRevision(d.revision);setSex(d.profile?.sex??"");setWeight(d.profile?.weightKg==null?"":String(d.profile.weightKg));setDirty(false);}
    }).catch(e=>{if(active)setError((e as Error).message);}).finally(()=>{if(active)setLoading(false);});
    void refreshImports();return()=>{active=false;};
  },[user?.id,user?.onboarded,redo,router,refreshImports]);
  async function finish(save:boolean){
    setBusy(true);setError("");
    try{
      if(save&&dirty){const fields=pilotProfilePatch({sex,weight},savedBasics.current,observationId);if(Object.keys(fields).length){const saved=await saveReviewedProfile(fields,revision);setRevision(saved.revision);savedBasics.current={sex,weight};}setDirty(false);setObservationId(null);}
      const r=await fetch("/api/onboard",{method:"POST",headers:{"Content-Type":"application/json"},body:"{}",signal:AbortSignal.timeout(15000)});
      if(!r.ok)throw Error("Could not finish setup. Your saved profile remains available; retry.");
      await refresh();router.replace("/today");
    }catch(e){setError((e as Error).message);}finally{setBusy(false);}
  }
  return <ProtectedPage><div className="max-w-2xl mx-auto space-y-5">
    <p className="text-sm font-semibold">{t("Free pilot · no payment required","Piloto gratuito · sin pago")}</p>
    <h1 className="font-display text-3xl">{t("Your athlete profile","Tu perfil de atleta")}</h1>
    <nav aria-label={t("Onboarding steps","Pasos iniciales")} className="flex flex-wrap gap-3">{["devices","profile"].map((s,i)=><button key={s} disabled={busy} className="btn-secondary" aria-current={step===s?"step":undefined} onClick={()=>setStep(s)}>{i===0?t("1. Connections","1. Conexiones"):t("2. Review profile","2. Revisar perfil")}</button>)}</nav>
    {error&&<p role="alert" className="text-red-700">{error} <button className="underline" onClick={()=>window.location.reload()}>{t("Reload saved profile","Recargar perfil")}</button></p>}
    {step==="devices"?<section className="space-y-4">
      <h2 className="font-bold text-xl">{t("First, connect your training account","Primero, conecta tu cuenta de entrenamiento")}</h2>
      <p>{t("Import the information you authorize, or continue without a device. No connection or questionnaire is required to enter the app.","Importa los datos que autorices o continúa sin dispositivo. Puedes entrar sin conectar ni contestar un cuestionario.")}</p>
      <p className="text-sm">{t("Strava imports completed activities. Garmin uses the configured Intervals.icu bridge or supported file uploads; this is not a direct Garmin login. Only available connections can be authorized below.","Strava importa actividades realizadas. Garmin utiliza Intervals.icu cuando está habilitado o archivos compatibles; no es un acceso directo a Garmin. Solo puedes autorizar las conexiones disponibles.")}</p>
      {providers.map(p=><article className="card space-y-2" key={p.id}><h3 className="font-semibold">{p.name}</h3><p className="text-sm">{p.description}</p><p className="text-sm">{p.status} · {p.lastSyncAt?`${t("Last import","Última importación")}: ${new Date(p.lastSyncAt).toLocaleString()}`:t("No successful import recorded","Sin importación confirmada")}</p>{p.lastError&&<p className="text-amber-800" role="status">{p.lastError}</p>}
        {p.configured&&p.method==="oauth"&&p.connectUrl?.startsWith("/api/connectors/")?<a className="btn-secondary" href={`${p.connectUrl}?return=${encodeURIComponent("/onboard?redo=1&step=devices")}`}>{t("Connect / reconnect","Conectar / reconectar")}</a>:p.method==="upload"?<Link className="underline" href="/connectors?onboarding=1">{t("Import a file","Importar archivo")}</Link>:<span className="text-sm">{t("Unavailable","No disponible")}</span>}
      </article>)}
      {importError&&<p role="alert">{importError}</p>}
      <button disabled={busy} className="btn-secondary" onClick={()=>void refreshImports()}>{t("Refresh import status","Actualizar importación")}</button>
      <p className="text-sm">{t("Imports run in the background after authorization. You can continue while they finish. Connected does not confirm a complete history, every metric or watch delivery.","Las importaciones se procesan en segundo plano. Puedes continuar mientras terminan. Conectado no confirma todo el historial, todas las métricas ni entrega al reloj.")}</p>
      <button disabled={busy} className="btn-primary" onClick={()=>setStep("profile")}>{providers.some(p=>p.status==="connected")?t("Review imported profile","Revisar perfil importado"):t("Continue without a device","Continuar sin dispositivo")}</button>
    </section>:<section className="space-y-4">
      <h2 className="font-bold text-xl">{t("Review what we know; fill only what you want","Revisa lo conocido; completa solo lo que quieras")}</h2>
      <div className="card"><p className="font-semibold">{user?.name}</p><p className="break-words">{user?.email}</p><p className="text-sm">{t("Identity from your JMM sign-in. Device accounts do not replace it.","Identidad de tu acceso a JMM. Los dispositivos no la reemplazan.")}</p></div>
      <div className="card"><h3 className="font-semibold">{t("Imported training history","Historial importado")}</h3><p>{review.history?`${review.history.count} ${t("completed activities stored","actividades realizadas guardadas")}`:t("History has not been loaded yet.","Aún no se cargó el historial.")}</p>{review.history?.latestAt&&<p className="text-sm">{t("Latest recorded activity","Actividad más reciente")}: {new Date(review.history.latestAt).toLocaleDateString()}</p>}{review.history?.sports.map(s=><span className="inline-block rounded-full border px-3 py-1 mr-2 mt-2 text-sm" key={s.sport}>{s.sport}: {s.count}</span>)}<p className="text-sm mt-2">{t("Stored history is not proof of a complete provider history or your current capacity.","El historial guardado no confirma que esté completo ni tu capacidad actual.")}</p></div>
      {importError&&<p role="alert">{importError}</p>}<button disabled={busy} className="underline" onClick={()=>void refreshImports()}>{t("Refresh imported information","Actualizar datos importados")}</button>
      <fieldset disabled={loading||busy||!revision} className="space-y-3"><legend className="font-semibold">{t("Optional basic details","Datos básicos opcionales")}</legend><p className="text-sm">{t("Saved values are prefilled. Blank means unknown. Provider weight may be self-reported: review it before saving.","Los datos guardados aparecen aquí. Vacío significa desconocido. El peso puede ser declarado: revísalo antes de guardar.")}</p>
        <label className="block">{t("Sex (optional)","Sexo (opcional)")}<select className="input" value={sex} onChange={e=>{setSex(e.target.value);setDirty(true);}}><option value="">{t("Not provided","Sin indicar")}</option><option value="male">{t("Male","Masculino")}</option><option value="female">{t("Female","Femenino")}</option></select></label>
        <label className="block">{t("Weight in kg (optional)","Peso en kg (opcional)")}<input type="number" min="20" max="350" step="0.1" className="input" value={weight} onChange={e=>{setWeight(e.target.value);setObservationId(null);setDirty(true);}}/></label>
        {review.suggestions?.map(s=><div className="rounded-lg border p-3 text-sm" key={`${s.source}-${s.observedAt}`}><p>{s.value} {s.unit} · {s.source} · {new Date(s.observedAt).toLocaleDateString()} · {s.kind}</p><button className="underline" onClick={()=>{setWeight(String(s.value));setObservationId(s.observationId);setDirty(true);}}>{t("Use this reviewed weight","Usar este peso revisado")}</button></div>)}
      </fieldset>
      <p className="text-sm">{t("Goals, available time, zones, travel and safety questions come later when you choose personalized planning. Without them, Today offers general guidance and conversation, not an invented personalized session.","Objetivos, tiempo, zonas, viajes y seguridad se revisan después al elegir un plan personalizado. Sin esos datos, Hoy ofrece orientación general y conversación, no una sesión personalizada inventada.")}</p>
      <button className="btn-primary" disabled={busy||loading||!revision} onClick={()=>void finish(true)}>{busy?"…":t("Save profile and open Today","Guardar perfil y abrir Hoy")}</button>
    </section>}
    <button className="underline" disabled={busy} onClick={()=>void finish(false)}>{t("Skip remaining questions and open Today","Omitir preguntas restantes y abrir Hoy")}</button><p className="text-xs">{t("Skipping keeps only saved details. Finishing setup does not assign a workout.","Omitir conserva solo lo guardado. Finalizar no asigna entrenamiento.")}</p>
    <Link className="block underline text-sm" href="/help/pilot">{t("Pilot workflow, next steps and links","Flujo del piloto, próximos pasos y enlaces")}</Link>
  </div></ProtectedPage>;
}
