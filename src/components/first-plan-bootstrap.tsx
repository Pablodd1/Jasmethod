"use client";
import { useEffect, useState } from "react";
import { useAuth } from "./auth";
import { planningGoal, PLANNABLE_GOALS } from "@/lib/planning-setup";
import { usePathname } from "next/navigation";
import { firstPlanEntryReceipt } from "@/lib/first-plan-entry";
/** Wait before mounting data-fetching app children, so first Today/Calendar
 * reads cannot race first-plan persistence. No session/global cache spans users. */
export function FirstPlanBootstrap({children}:{children:React.ReactNode}){
  const {user,language}=useAuth();
  const pathname=usePathname();
  const eligible=["/today","/calendar","/training","/coach"].includes(pathname)&&!!user?.onboarded&&PLANNABLE_GOALS.includes(planningGoal(user.profile?.goal)||"");
  const key=eligible?`${user!.id}:${user!.profile.goal}`:"";
  const [settled,setSettled]=useState("");
  const [failed,setFailed]=useState("");
  const [chooseSport,setChooseSport]=useState("");
  const [attempt,setAttempt]=useState(0);
  useEffect(()=>{
    if(!key)return;
    const target=new URLSearchParams(window.location.search).get("athleteId");
    if(target&&target!==user?.id){setSettled(key);return;}
    let current=true;
    const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),45000);
    setFailed("");
    fetch("/api/plan/ensure",{method:"POST",headers:{"Content-Type":"application/json"},body:"{}",signal:controller.signal})
      .then(async response=>{const receipt=firstPlanEntryReceipt(await response.json());if(!response.ok||!receipt)throw new Error("First plan unavailable");if(current){if(receipt==="choose_sport")setChooseSport(key);else setSettled(key);}})
      .catch(()=>{if(current)setFailed(key);})
      .finally(()=>clearTimeout(timeout));
    return()=>{current=false;controller.abort();clearTimeout(timeout);};
  },[key,attempt,user?.id]);
  if(!key||settled===key)return <>{children}</>;
  const es=language==="es";
  if(chooseSport===key)return <div className="card"><a className="btn-primary" href="/settings">{es?"Elige tu deporte en el perfil":"Choose your sport in Profile"}</a></div>;
  if(failed===key)return <div role="alert" className="card space-y-3"><p>{es?"No pudimos cargar tu plan. Tus datos siguen guardados.":"We could not load your plan. Your saved data is preserved."}</p><button className="btn-primary" onClick={()=>setAttempt(value=>value+1)}>{es?"Reintentar":"Retry"}</button><a className="underline block" href="/settings">{es?"Revisar perfil":"Review profile"}</a></div>;
  return <p role="status" className="p-6">{es?"Cargando tu entrenamiento…":"Loading your training…"}</p>;
}
