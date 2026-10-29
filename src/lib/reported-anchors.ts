import { dateKey, localDate } from './dates';
import { readManualPersonalBests } from './onboarding-evidence';
export const REPORTED_ANCHORS=[{field:'ftp',label:'JMM manual FTP reference',unit:'W',min:20,max:700},{field:'runPaceBase',label:'JMM manual run threshold reference',unit:'sec/km',min:120,max:1200},{field:'swimPaceBase',label:'JMM manual CSS reference',unit:'sec/100m',min:30,max:600}] as const;
/** A dated athlete report is never relabelled as a measured/applied test. */
export function reportedAnchor(profile:{manualPrs?:string|null;[key:string]:unknown}|null|undefined,field:string,now=new Date(),timezone='UTC') {
 const definition=REPORTED_ANCHORS.find(a=>a.field===field),rows=readManualPersonalBests(profile?.manualPrs);
 if(!definition||!rows)return null;
 const today=dateKey(now,timezone),value=profile?.[definition.field];
 const eligible=rows.filter(r=>r.label===definition.label&&r.unit===definition.unit&&r.value===value&&r.value>=definition.min&&r.value<=definition.max&&/^\d{4}-\d{2}-\d{2}$/.test(r.date)&&Number.isFinite(Date.parse(r.date+'T12:00Z'))&&new Date(r.date+'T12:00Z').toISOString().slice(0,10)===r.date&&r.date<=today&&localDate(today,timezone).getTime()-localDate(r.date,timezone).getTime()<=90*86400000).sort((a,b)=>b.date.localeCompare(a.date));
 const row=eligible[0];return row?{value:row.value,source:'athlete_reported_reference' as const,observedAt:row.date,unit:row.unit,id:`manual:${definition.field}:${row.date}:${row.value}`} :null;
}
export function recordReportedAnchors(raw:unknown,profile:Record<string,unknown>,observedOn:string,today:string){
 const rows=readManualPersonalBests(raw);if(!rows)throw Error('Review saved personal records before adding dated references.');
 if(!/^\d{4}-\d{2}-\d{2}$/.test(observedOn)||!Number.isFinite(Date.parse(observedOn+'T12:00Z'))||new Date(observedOn+'T12:00Z').toISOString().slice(0,10)!==observedOn||observedOn>today)throw Error('Choose the actual reference observation date, no later than today in your timezone.');
 const next=[...rows];
 for(const a of REPORTED_ANCHORS){const value=Number(profile[a.field]);if(profile[a.field]==null||profile[a.field]==='')continue;if(!Number.isFinite(value)||value<a.min||value>a.max)throw Error('Review the '+a.field+' reference and units.');const row={label:a.label,unit:a.unit,value,date:observedOn};if(!next.some(r=>r.label===row.label&&r.unit===row.unit&&r.value===row.value&&r.date===row.date))next.push(row);}
 if(next.length>50)throw Error('Review the saved record limit before adding references.');return JSON.stringify(next);
}
