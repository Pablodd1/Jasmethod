"use client";
import {useCallback,useEffect,useRef,useState} from "react";
import Link from "next/link";
export function CoachingConversation({athleteId}:{athleteId?:string}) {
 const [messages,setMessages]=useState<any[]>([]),[assignments,setAssignments]=useState<any[]>([]);
 const [body,setBody]=useState(""),[error,setError]=useState(""),[busy,setBusy]=useState(false);
 const pending=useRef<{body:string;clientId:string}|null>(null);
 const url="/api/coaching/messages"+(athleteId?`?athleteId=${encodeURIComponent(athleteId)}`:"");
 const load=useCallback(async()=>{
  const r=await fetch(url);const d=await r.json();if(!r.ok) {setMessages([]);throw Error(d.error||"Could not load conversation");}setMessages(d.messages);
  if(!athleteId){const a=await fetch("/api/coaching/assignments");if(a.ok)setAssignments((await a.json()).assignments);}
 },[url,athleteId]);
 useEffect(()=>{let alive=true;const refresh=()=>{if(document.visibilityState==="visible")load().catch(e=>{if(alive)setError(e.message);});};refresh();const timer=setInterval(refresh,30000);return()=>{alive=false;clearInterval(timer);};},[load]);
 async function send(e:React.FormEvent){e.preventDefault();setBusy(true);setError("");try{
  if(!pending.current||pending.current.body!==body.trim())pending.current={body:body.trim(),clientId:crypto.randomUUID()};
  const r=await fetch(url,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(pending.current)});
  const d=await r.json();if(!r.ok)throw Error(d.error);setBody("");pending.current=null;await load();
 }catch(e){setError((e as Error).message);}finally{setBusy(false);}}
 async function consent(id:string,value:string){setBusy(true);setError("");try{const r=await fetch("/api/coaching/assignments",{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify({id,consent:value})});if(!r.ok)throw Error((await r.json()).error);await load();}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
 return <section className="card space-y-3"><h2 className="font-bold text-lg">Athlete–coach conversation</h2>
 <p className="text-sm text-slate-600">Shared with authorized coaches and platform administrators. Messages refresh every 30 seconds while this page is visible. Discuss a change here, then save it in the training or profile editor; messages do not change your plan automatically.</p>
 {!athleteId&&assignments.map(a=><div key={a.id} className="flex flex-wrap gap-3 items-center text-sm"><span>{a.coach.name}: {a.consent} ({a.status})</span><button disabled={busy||a.status!=="active"} className="btn-secondary" onClick={()=>consent(a.id,a.consent==="granted"?"revoked":"granted")}>{a.consent==="granted"?"Revoke coach access":"Grant coach access"}</button></div>)}
 {!athleteId&&!assignments.length&&<p className="text-sm">No coach is assigned. Your notes remain available here for you and the platform administrator.</p>}
 <div className="max-h-80 overflow-y-auto space-y-3" aria-live="polite">{messages.map(m=><article key={m.id} className="rounded-lg bg-slate-50 p-3"><p className="text-xs text-slate-500">{m.author.name} · {m.author.role} · {new Date(m.createdAt).toLocaleString()}</p><p className="whitespace-pre-wrap break-words">{m.body}</p></article>)}{!messages.length&&<p>No messages yet.</p>}</div>
 <p className="text-xs text-slate-500">Showing the latest 100 messages.</p>
 {error&&<p role="alert" className="text-red-700">{error}</p>}
 <form onSubmit={send} className="space-y-2"><label className="block">Message<textarea className="input" maxLength={4000} required value={body} onChange={e=>setBody(e.target.value)}/></label><button className="btn-primary" disabled={busy||!body.trim()}>{busy?"Saving…":"Send message"}</button></form>
 {!athleteId&&<div className="flex flex-wrap gap-3 text-sm"><Link href="/settings">Edit profile and zones</Link><Link href="/checkin">Device-free daily check-in</Link><Link href="/training">Training and baseline tests</Link></div>}
 </section>;
}
