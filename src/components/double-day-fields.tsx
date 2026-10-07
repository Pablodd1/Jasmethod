"use client";
import { DOUBLE_DAY_VERSION, type DoubleDayPreference } from '@/lib/double-day';
export function DoubleDayFields({value,onChange}:{value:DoubleDayPreference|null;onChange:(value:DoubleDayPreference|null)=>void}) {
 return <fieldset className="border rounded-xl p-4 space-y-3">
  <legend className="font-semibold">Optional weekly double day / Doble sesión opcional</legend>
  <p className="text-sm">Move one existing easy session onto your chosen priority day; no extra weekly work is added. Two demanding sessions are not automatically allowed. You may decline without catch-up training.</p>
  <label className="flex gap-2"><input type="checkbox" checked={!!value} onChange={e=>onChange(e.target.checked?{version:DOUBLE_DAY_VERSION,weekday:-1,purpose:'',firstStart:'',secondStart:'',athleteAgreed:false,priorTolerance:false,foodFluidsAvailable:false,recheckBetween:false}:null)}/>Plan an optional pair / Planificar una pareja opcional</label>
  {value&&<>
   <label className="block">Preferred weekday / Día<select className="input" value={value.weekday<0?'':value.weekday} onChange={e=>onChange({...value,weekday:e.target.value===''?-1:Number(e.target.value),athleteAgreed:false})}><option value="">Choose / Elegir</option>{['Sunday / Domingo','Monday / Lunes','Tuesday / Martes','Wednesday / Miércoles','Thursday / Jueves','Friday / Viernes','Saturday / Sábado'].map((day,i)=><option key={day} value={i}>{day}</option>)}</select></label>
   <label className="block">How does this support your goal? / ¿Cómo apoya tu objetivo?<textarea className="input" maxLength={500} value={value.purpose} onChange={e=>onChange({...value,purpose:e.target.value,athleteAgreed:false})}/></label>
   <div className="grid grid-cols-2 gap-3">{(['firstStart','secondStart'] as const).map((key,i)=><label key={key}>Session {i+1} start / Hora {i+1}<input type="time" className="input" value={value[key]} onChange={e=>onChange({...value,[key]:e.target.value,athleteAgreed:false})}/></label>)}</div>
   <p className="text-sm">The first bout keeps priority. The second is an existing easy bout, moved only if the whole pair fits your daily limit and leaves time between sessions. A time gap alone does not establish recovery.</p>
   {([
    ['priorTolerance','I have recently tolerated comparable double-session days / He tolerado días similares recientemente.'],
    ['foodFluidsAvailable','I can access familiar food and fluids between sessions / Tengo acceso a comida y bebida entre sesiones.'],
    ['recheckBetween','I will report session one and complete a new check-in before session two / Registraré la primera sesión y haré un nuevo chequeo antes de la segunda.'],
    ['athleteAgreed','I agree to this optional weekday, purpose and times; I will review both sessions in the plan preview / Acepto estos datos opcionales y revisaré ambas sesiones antes de confirmar el plan.'],
   ] as const).map(([key,label])=><label key={key} className="flex gap-2 items-start text-sm"><input type="checkbox" checked={value[key]} onChange={e=>onChange({...value,[key]:e.target.checked,...(key!=='athleteAgreed'?{athleteAgreed:false}:{})})}/>{label}</label>)}
  </>}
 </fieldset>;
}
