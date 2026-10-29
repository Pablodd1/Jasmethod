"use client";
import { useEffect, useRef, useState } from "react";
import { profileUnitFormValues, profileUnitPatch } from "@/lib/profile-unit-fields";
import type { UnitSystem } from "@/lib/units";

export type MeasurementField="weightKg"|"heightCm"|"runPaceBase"|"swimPaceBase";
/** Draft text stays local; only valid, explicitly edited metric values reach the
 * existing form. A units/language switch redisplays that same canonical value. */
export function ProfileMeasurementInput({field,value,units,label,onChange,onValidityChange,es=false,id}:{
  field:MeasurementField;value:string|number|null|undefined;units:UnitSystem;label:string;id?:string;es?:boolean;
  onChange:(canonical:string)=>void;onValidityChange:(field:MeasurementField,error:string|null)=>void;
}) {
  const canonical=()=>value==null||value===""?{}:{[field]:Number(value)};
  const [draft,setDraft]=useState(()=>profileUnitFormValues(canonical(),units));
  const [error,setError]=useState<string|null>(null);
  const emitted=useRef(String(value??"")),previousScope=useRef({units,field});
  const validityCallback=useRef(onValidityChange);validityCallback.current=onValidityChange;
  useEffect(()=>{
    if(String(value??"")!==emitted.current || previousScope.current.units!==units || previousScope.current.field!==field) {
      emitted.current=String(value??"");previousScope.current={units,field};
      setDraft(profileUnitFormValues(value==null||value===""?{}:{[field]:Number(value)},units));
      setError(null);validityCallback.current(field,null);
    }
  },[value,units,field]);
  function change(name:string,text:string) {
    const next={...draft,[name]:text};setDraft(next);
    try {
      const result=profileUnitPatch(next,canonical(),units)[field];
      const current=result==null?"":String(result);emitted.current=current;
      setError(null);onValidityChange(field,null);onChange(current);
    }catch(failure){const message=(failure as Error).message;setError(message);onValidityChange(field,message);}
  }
  const fieldId=id??`measurement-${field}`;
  const height=field==="heightCm"&&units==="imperial";
  const unit=field==="weightKg"?(units==="imperial"?"lb":"kg"):field==="heightCm"?"cm":field==="runPaceBase"?`min:sec/${units==="imperial"?"mi":"km"}`:`min:sec/100 ${units==="imperial"?"yd":"m"}`;
  return <div className="space-y-1">
    {height?<fieldset><legend className="text-sm">{label} ({es?"pies y pulgadas":"feet and inches"})</legend><div className="flex gap-2">{[["heightFeet",es?"Pies":"Feet"],["heightInches",es?"Pulgadas":"Inches"]].map(([name,title])=><label key={name} className="text-sm">{title}<input id={`${fieldId}-${name}`} className="input" type="number" min="0" step={name==="heightFeet"?"1":"any"} value={draft[name]??""} aria-invalid={!!error} aria-describedby={error?`${fieldId}-error`:undefined} onChange={event=>change(name,event.target.value)}/></label>)}</div></fieldset>:<label className="block text-sm" htmlFor={fieldId}>{label} ({unit})<input id={fieldId} className="input" type={field.endsWith("PaceBase")?"text":"number"} step="any" value={draft[field]??""} aria-invalid={!!error} aria-describedby={error?`${fieldId}-error`:undefined} onChange={event=>change(field,event.target.value)} placeholder={field.endsWith("PaceBase")?"m:ss":undefined}/></label>}
    {error&&<p id={`${fieldId}-error`} role="alert" className="text-sm text-red-700">{error}</p>}
  </div>;
}
