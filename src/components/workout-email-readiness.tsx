import Link from "next/link";
import React from "react";
export interface WorkoutEmailHealth {
  configured:boolean;storageAvailable:boolean;blockers:string[];timezone:string;minuteOfDay:number|null;recentLimit:number;
  statuses:{queued:number;providerAccepted:number;outcomeUnknown:number;rejected:number};
  recentAttempts:{id:string;sessionId:string;kind:string;status:string;createdAt:string;acceptedAt:string|null}[];
  received:null;
}
export function isWorkoutEmailHealth(value:unknown):value is WorkoutEmailHealth {
  if(!value||typeof value!=="object")return false;const v=value as WorkoutEmailHealth;
  return typeof v.configured==="boolean"&&typeof v.storageAvailable==="boolean"&&Array.isArray(v.blockers)&&v.blockers.every(item=>typeof item==="string")&&typeof v.timezone==="string"&&(v.minuteOfDay===null||Number.isInteger(v.minuteOfDay)&&v.minuteOfDay>=0&&v.minuteOfDay<1440)&&Number.isInteger(v.recentLimit)&&!!v.statuses&&[v.statuses.queued,v.statuses.providerAccepted,v.statuses.outcomeUnknown,v.statuses.rejected].every(item=>Number.isInteger(item)&&item>=0)&&Array.isArray(v.recentAttempts)&&v.recentAttempts.every(item=>!!item&&[item.id,item.sessionId,item.kind,item.status,item.createdAt].every(field=>typeof field==="string"))&&v.received===null;
}
export function WorkoutEmailReadiness({health,unavailable,es=false,onRetry}:{health:WorkoutEmailHealth|null;unavailable?:boolean;es?:boolean;onRetry?:()=>void}) {
  const text=(en:string,spanish:string)=>es?spanish:en;
  const blockers:Record<string,string>={
    email_unconfigured:text("Workout email is disabled or its server configuration is incomplete.","El correo de entrenamientos está desactivado o su configuración del servidor está incompleta."),
    scheduler_unconfigured:text("The email worker is not configured. An administrator must review scheduling.","El programador de correo no está configurado. Un administrador debe revisarlo."),
    email_storage_unavailable:text("Email preferences or outbox storage cannot be read. No delivery status is inferred.","No se pueden consultar las preferencias o la cola de correo. No se supone ningún estado de entrega."),
    email_paused:text("Workout email is paused.","El correo de entrenamientos está pausado."),
    email_unverified:text("Verify the current email address in your account.","Verifica el correo actual de tu cuenta."),
    email_consent_required:text("Review and accept the separate workout email contents.","Revisa y acepta por separado el contenido del correo de entrenamientos."),
    email_no_purposes:text("Choose a workout email purpose.","Elige un fin para el correo de entrenamientos."),
    email_timezone_changed:text("Review the email schedule after changing your profile timezone.","Revisa el horario de correo tras cambiar la zona horaria del perfil."),
    email_language_unsupported:text("Reviewed workout emails currently support English and Spanish.","Los correos revisados de entrenamientos admiten actualmente inglés y español."),
  };
  const status:Record<string,string>={queued:text("Queued","En cola"),sending:text("Outcome not yet confirmed","Resultado aún sin confirmar"),accepted:text("Provider accepted","Aceptado por el proveedor"),unknown:text("Outcome unknown; no automatic resend","Resultado desconocido; sin reenvío automático"),rejected:text("Provider rejected","Rechazado por el proveedor"),cancelled:text("Cancelled","Cancelado"),superseded:text("Superseded revision","Revisión sustituida")};
  return <section className="card space-y-3" aria-label={text("Workout email readiness","Estado del correo de entrenamientos")}>
    <h2 className="font-bold text-lg">{text("Workout email","Correo de entrenamientos")}</h2>
    <p className="text-sm">{text("Email uses its own verification, consent and worker. Google Calendar and Telegram connections are separate.","El correo tiene su propia verificación, consentimiento y programador. Google Calendar y Telegram son conexiones independientes.")}</p>
    {!health ? <p role="status">{unavailable?text("Email health could not be loaded. Its readiness and delivery status are unknown; other reminder settings remain available.","No se pudo consultar el estado del correo. Su disponibilidad y entrega son desconocidas; los demás ajustes siguen disponibles."):text("Loading email status…","Cargando estado del correo…")}</p>:<>
      <p>{health.minuteOfDay===null?text("Send time not selected","Hora de envío sin elegir"):`${String(Math.floor(health.minuteOfDay/60)).padStart(2,"0")}:${String(health.minuteOfDay%60).padStart(2,"0")}`} · {health.timezone}</p>
      {health.blockers.length?<ul className="list-disc pl-5">{health.blockers.map(blocker=><li key={blocker}>{blockers[blocker]??text("A delivery prerequisite needs review.","Es necesario revisar un requisito de envío.")}</li>)}</ul>:<p>{text("Preferences allow the worker to evaluate eligible current workouts. A cleared session and exact approved revision are still required for workout attachments; this does not confirm a send.","Las preferencias permiten evaluar los entrenamientos actuales elegibles. Los archivos requieren una sesión autorizada y su revisión exacta aprobada; esto no confirma un envío.")}</p>}
      <p className="text-sm">{text("Recent outbox records (up to","Registros recientes de la cola (hasta")} {health.recentLimit}): {text("queued","en cola")} {health.statuses.queued} · {text("provider accepted","aceptados por el proveedor")} {health.statuses.providerAccepted} · {text("outcome unknown/in progress","resultado desconocido/en curso")} {health.statuses.outcomeUnknown} · {text("rejected","rechazados")} {health.statuses.rejected}</p>
      {!!health.recentAttempts.length&&<details><summary className="cursor-pointer">{text("Review recent attempts","Revisar intentos recientes")}</summary><ul className="space-y-1 mt-2">{health.recentAttempts.map(attempt=><li key={attempt.id} className="text-sm">{attempt.createdAt.slice(0,10)} · {status[attempt.status]??text("Unrecognized status; review required","Estado sin reconocer; requiere revisión")}</li>)}</ul></details>}
      <p className="text-sm">{text("SMTP acceptance is not inbox receipt or watch delivery. Receipt is unconfirmed. Unknown attempts are not automatically resent.","La aceptación SMTP no confirma recepción en la bandeja ni en el reloj. La recepción sigue sin confirmar. Los intentos de resultado desconocido no se reenvían automáticamente.")}</p>
    </>}
    {unavailable&&onRetry&&<button className="btn-secondary" onClick={onRetry}>{text("Retry email status","Reintentar estado del correo")}</button>}
    <Link className="underline" href="/workout-email/settings">{text("Verify, schedule or pause workout email","Verificar, programar o pausar el correo de entrenamientos")}</Link>
  </section>;
}
