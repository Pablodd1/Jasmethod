'use client';
import React,{useId,useRef,useState} from 'react';
import type {CoachMessage} from './coach-conversation-client';
export function CoachReviewRequest({messages,es,disabled}:{messages:CoachMessage[];es:boolean;disabled:boolean}) {
  const questionId=useId();
  const lastUser=[...messages].reverse().find(m=>m.role==='user');
  const needsReview=[...messages].reverse().find(m=>m.role==='assistant')?.needsHumanReview===true;
  const [open,setOpen]=useState(false),[question,setQuestion]=useState(''),[notify,setNotify]=useState(false),[busy,setBusy]=useState(false),[status,setStatus]=useState(''),[error,setError]=useState('');
  const attempt=useRef<{hash:string;id:string}|null>(null);
  async function submit(e:React.FormEvent) {
    e.preventDefault();if(!lastUser||busy||disabled)return;
    setBusy(true);setError('');setStatus('');
    const hash=JSON.stringify([lastUser.id,question.trim(),notify]);
    if(attempt.current?.hash!==hash)attempt.current={hash,id:crypto.randomUUID()};
    try {
      const r=await fetch('/api/assistant/escalate',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sourceMessageId:lastUser.id,question:question.trim(),clientId:attempt.current.id,confirmed:true,notifyAdmin:notify}),signal:AbortSignal.timeout(20000)});
      const data=await r.json();if(!r.ok||data.ok!==true||typeof data.sharedMessageId!=='string')throw Error(data.error||(es?'No se pudo verificar la solicitud.':'Could not verify the request.'));
      const notice=data.notificationStatus==='accepted'?(es?' Telegram aceptó una alerta general para el administrador; lectura sin confirmar.':' Telegram accepted a generic administrator alert; reading is unconfirmed.'):notify?(es?' No se confirmó la alerta de Telegram.':' Telegram notification is unconfirmed.'):'';
      setStatus((es?'Pregunta guardada para tus entrenadores autorizados y el administrador. Aún no confirma lectura ni respuesta.':'Question saved for your authorized coaches and administrator. This does not confirm reading or a reply.')+notice);
    }catch(e){setError(e instanceof Error?e.message:'Request unavailable');}finally{setBusy(false);}
  }
  return <section className="rounded-lg border p-3 space-y-2" aria-label={es?'Revisión de entrenador humano':'Human coach review'}>
    {needsReview&&<p role="status" className="text-sm font-medium">{es?'Esta decisión necesita más contexto o revisión humana.':'This decision needs more context or human review.'}</p>}
    <button type="button" className="btn-secondary" disabled={disabled||!lastUser||busy} onClick={()=>{if(!open){setQuestion(lastUser?.content.slice(0,1500)||'');setStatus('');setError('');}setOpen(!open);}}>{es?'Consultar al entrenador humano':'Ask a human coach'}</button>
    {open&&<form onSubmit={submit} className="space-y-3">
      <p className="text-sm">{es?'Comparte solo la pregunta que revises abajo en la conversación atleta–entrenador. Pueden verla los entrenadores asignados con acceso autorizado y los administradores de JMM. No se comparte el chat privado completo.':'Share only the question you review below in the athlete–coach conversation. Assigned coaches with granted access and JMM administrators can read it. The full private chat is not shared.'}</p>
      <label className="block text-sm" htmlFor={questionId}>{es?'Pregunta para el entrenador':'Question for the coach'}</label><textarea id={questionId} className="input mt-1" rows={3} minLength={10} maxLength={1500} required value={question} onChange={e=>setQuestion(e.target.value)} disabled={busy||disabled}/>
      <label className="flex gap-2 items-start text-sm"><input type="checkbox" checked={notify} onChange={e=>setNotify(e.target.checked)} disabled={busy||disabled}/>{es?'Enviar también una alerta general al Telegram del administrador. Sin pregunta, identidad ni datos de salud.':'Also send a generic alert to the administrator’s Telegram. No question, identity or health data is included.'}</label>
      <p className="text-xs text-slate-700">{es?'No es un servicio de urgencias ni confirma que alguien esté disponible.':'This is not an emergency service and does not establish that a person is available.'}</p>
      <button className="btn-primary" disabled={busy||disabled||question.trim().length<10}>{es?'Confirmar y compartir pregunta':'Confirm and share question'}</button>
    </form>}
    {status&&<p role="status" className="text-sm">{status}</p>}{error&&<p role="alert" className="text-sm text-red-700">{error}</p>}
  </section>;
}
