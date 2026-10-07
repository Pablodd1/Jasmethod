"use client";
import { NUTRITION_CONTEXT_VERSION } from '@/lib/nutrition-context';

type Section = 'carbohydratePractice' | 'sweatMeasurement' | 'turnaround';
const fields: Record<Section, [string, string, string][]> = {
  carbohydratePractice: [['observedAt','Practice date','date'],['sport','Sport','sport'],['durationMin','Practiced duration (minutes)','number'],['intensity','Practiced effort label','zone'],['conditions','Practice conditions (heat, terrain, etc.)','text'],['productMixture','Carbohydrate mixture / food used','text'],['toleratedGPerHour','Tolerated TOTAL carbohydrate (g/hour)','number'],['targetGPerHour','Selected TOTAL carbohydrate (g/hour)','number'],['giSymptoms','GI symptoms during practice','symptoms']],
  sweatMeasurement: [['observedAt','Measurement date','date'],['sport','Measurement sport','sport'],['intensity','Measurement effort label','zone'],['context','Measurement conditions and method','text'],['sweatRateMlH','Measured sweat rate (mL/hour), matching reported profile value','number']],
  turnaround: [['sessionId','Session ID (from its Daily page link)','text'],['dateLocal','Session local date','date'],['startTime','Session start time (leave blank only if unscheduled)','time'],['durationMin','Effective session duration (minutes)','number'],['intensity','Effective session effort label','zone'],['nextSessionInHours','Hours from this session ending to next session starting','number']],
};
const titles = { carbohydratePractice:'Carbohydrate practice', sweatMeasurement:'Sweat measurement provenance', turnaround:'Specific session turnaround' };
export function NutritionContextEditor({value,onChange}:{value:any;onChange:(value:any)=>void}) {
  const root = value && typeof value === 'object' ? value : {version:NUTRITION_CONTEXT_VERSION};
  function update(section:Section,key:string,next:any){onChange({...root,[section]:{...root[section],[key]:next}});}
  return <details className="card space-y-4">
    <summary className="cursor-pointer font-semibold">Nutrition context (optional)</summary>
    <p className="text-sm text-slate-600">Record observations, not guesses. These are athlete-reported records, not clinical clearance. Save with your profile. Missing or mismatched data stays unverified.</p>
    <p className="text-sm text-slate-600">A 90-day review window is an app policy, not a biological expiry. Higher intake needs matching session conditions; these are not yet collected by the daily workflow, so it will not raise your intake above 60 g/hour from this form. Self-reported review never authorizes intake above 90 g/hour.</p>
    {(Object.keys(fields) as Section[]).map(section=><fieldset key={section} className="border border-slate-200 rounded-lg p-3 space-y-3">
      <legend className="px-1 font-medium">{titles[section]}</legend>
      <label className="flex gap-2 items-center text-sm"><input type="checkbox" checked={!!root[section]} onChange={e=>onChange({...root,[section]:e.target.checked ? (section==='sweatMeasurement'?{source:'measured'}:section==='turnaround'?{startTime:null}:{}):null})}/>Include this record</label>
      {root[section] && <div className="grid sm:grid-cols-2 gap-3">{fields[section].map(([key,label,type])=>{
        const options=type==='sport'?['run','bike','swim','brick','hyrox','strength']:type==='zone'?['z1','z2','z3','z4','z5','z6','z7']:type==='symptoms'?['none','mild','moderate','severe']:null;
        return <label key={key} className="block text-sm">{label}{options?<select className="input mt-1" value={root[section][key]??''} onChange={e=>update(section,key,e.target.value)}><option value="">Select</option>{options.map(option=><option key={option} value={option}>{option}</option>)}</select>:<input className="input mt-1" type={type} step={type==='number'?'any':undefined} value={root[section][key]??''} onChange={e=>update(section,key,type==='number'?(e.target.value===''?'':Number(e.target.value)):type==='time'?(e.target.value||null):e.target.value)}/>}</label>;
      })}</div>}
    </fieldset>)}
    <p className="text-sm text-slate-600">Changing session timing, effort or duration invalidates its saved turnaround. A short turnaround record is not agreement to an extra workout.</p>
    <button type="button" className="btn-secondary" onClick={()=>onChange(null)}>Clear nutrition context on next save</button>
  </details>;
}
