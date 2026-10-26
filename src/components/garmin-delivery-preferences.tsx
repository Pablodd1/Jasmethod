"use client";
import { useEffect,useState } from "react";
import { GARMIN_AUTO_CONSENT } from "@/lib/garmin-config";
type Preferences={available:boolean;enabled:boolean;importsAvailable:boolean;recordsStored?:number;historicalBackfill:false;receipts:{sessionId:string;date:string;status:string;deviceReceived:false}[]};
export function GarminDeliveryPreferences({lang}:{lang:"en"|"es"}){
 const es=lang==="es",[value,setValue]=useState<Preferences|null>(null),[error,setError]=useState(""),[consent,setConsent]=useState(false),[busy,setBusy]=useState(false);
 useEffect(()=>{const controller=new AbortController();fetch("/api/connectors/garmin/preferences",{cache:"no-store",signal:controller.signal}).then(async r=>{
  const v=await r.json();if(!r.ok || typeof v.available!=="boolean" || typeof v.enabled!=="boolean" || !Array.isArray(v.receipts))throw new Error();setValue(v);
 }).catch(e=>{if(e.name!=="AbortError")setError(es?"No se pudo comprobar la entrega automática.":"Could not check automatic delivery.");});return()=>controller.abort();},[es]);
 async function save(){if(!value)return;setBusy(true);setError("");try{const enabled=!value.enabled;
  const response=await fetch("/api/connectors/garmin/preferences",{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify({enabled,...(enabled?{consent:GARMIN_AUTO_CONSENT}:{})})});
  const data=await response.json();if(!response.ok || data.enabled!==enabled)throw new Error();setValue({...value,enabled});setConsent(false);
 }catch{setError(es?"No se confirmó el cambio. Actualiza antes de intentarlo de nuevo.":"The change was not confirmed. Refresh before trying again.");}finally{setBusy(false);}}
 const labels:Record<string,string>=es?{published:"Último calendario Garmin confirmado; reloj sin verificar",cancelled:"Retirado de Garmin",working:"En proceso",unknown:"Requiere revisión; sin reintento de creación",failed:"Entrega no confirmada"}:{published:"Last confirmed Garmin calendar; watch unverified",cancelled:"Withdrawn from Garmin",working:"In progress",unknown:"Needs review; creation retry blocked",failed:"Delivery unconfirmed"};
 return <div className="border-t pt-3 space-y-2" data-testid="garmin-delivery-preferences">
  <h3 className="font-semibold">{es?"Mis entrenamientos en Garmin":"My workouts in Garmin"}</h3>
  {value && <>
   {typeof value.recordsStored==="number" && value.recordsStored>0 && <p className="text-sm">{es?`${value.recordsStored} entregas guardadas en JMM. `:`${value.recordsStored} deliveries saved in JMM. `}<a className="underline" href="/api/connectors/garmin/data">{es?"Ver mis registros importados":"View my imported records"}</a></p>}
   <p className="text-sm">{es?"Publicación estructurada: carrera y ciclismo. Otros deportes mantienen las instrucciones y archivos de JMM. Sincroniza Garmin Connect con tu reloj.":"Structured publication: running and cycling. Other sports keep JMM instructions and file exports. Sync Garmin Connect with your watch."}</p>
   {!value.available && <p className="text-sm">{es?"La publicación automática aún no está activada en producción.":"Automatic publication is not yet activated in production."}</p>}
   {(value.available || value.enabled) && <>
    {!value.enabled && <label className="flex gap-3 items-start text-sm"><input type="checkbox" className="mt-1 h-5 w-5" checked={consent} onChange={e=>setConsent(e.target.checked)}/>{es?"Autorizo publicar mis sesiones prescritas de los próximos 7 días y retirar o reemplazar las que cambien. El reloj puede requerir sincronización.":"I allow publication of my prescribed sessions for the next 7 days and withdrawal or replacement when they change. My watch may need syncing."}</label>}
    <button type="button" className="btn-secondary" disabled={busy || (!value.enabled && (!consent || !value.available))} onClick={save}>{value.enabled?(es?"Detener nuevas publicaciones":"Stop new publications"):(es?"Activar publicación automática":"Enable automatic publication")}</button>
    <p className="text-xs">{es?"Al detenerla, las sesiones ya publicadas siguen recibiendo correcciones o cancelaciones de seguridad mientras Garmin esté autorizado.":"After stopping, existing publications still receive safety corrections or cancellations while Garmin remains authorized."}</p>
   </>}
   {value.receipts.length>0 && <ul className="text-sm space-y-1">{value.receipts.slice(0,10).map(r=><li key={r.sessionId}>{r.date} · {labels[r.status]??(es?"Sin confirmar":"Unconfirmed")}</li>)}</ul>}
  </>}
  {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
 </div>;
}
