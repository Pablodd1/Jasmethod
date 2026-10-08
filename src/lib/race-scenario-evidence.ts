/** Display-only source evidence. No threshold-to-race-capacity conversion. */
export interface RaceScenarioAnchor {
  id:string; kind:'benchmark'|'profile'; sport:'run'|'bike'|'swim'|null;
  metric:'pace'|'power'|'hr'; value:number; unit:'sec/km'|'sec/100m'|'W'|'bpm';
  observedAt:string|null; context:string; source:string; usable:boolean; reason:string|null;
}
type Test={id:string;type:string;result:number|null;date:Date;name:string;completed:boolean;skipped:boolean};
export function buildRaceScenarioAnchors(tests:Test[],profile:Record<string,unknown>|null,now=new Date()):RaceScenarioAnchor[]{
 const anchors:RaceScenarioAnchor[]=[];
 for(const t of tests){
  if(!t.completed||t.skipped||t.result===null||!Number.isFinite(t.result)||t.result<=0)continue;
  const mapping=t.type==='run5k'?{sport:'run' as const,metric:'pace' as const,value:t.result/5,unit:'sec/km' as const,context:'5 km observed average pace (result seconds ÷ 5); not threshold or a longer-race prediction'}:t.type==='ftp'?{sport:'bike' as const,metric:'power' as const,value:t.result,unit:'W' as const,context:'Cycling FTP benchmark; not sustainable race power'}:t.type==='swim'?{sport:'swim' as const,metric:'pace' as const,value:t.result,unit:'sec/100m' as const,context:'Swimming threshold/CSS benchmark; verify protocol and course applicability'}:t.type==='lthr'?{sport:null,metric:'hr' as const,value:t.result,unit:'bpm' as const,context:'Legacy LTHR without a recorded sport; cannot set race HR'}:t.type==='cp'?{sport:null,metric:'power' as const,value:t.result,unit:'W' as const,context:'Legacy CP without a recorded sport/protocol; cannot set race power'}:null;
  if(!mapping)continue;
  const age=now.getTime()-t.date.getTime();
  const reason=mapping.sport===null?'Sport and protocol are unknown. Enter a dated, sport-specific reference.':age<0?'Observation is in the future.':age>90*86400000?'Reference is older than the 90-day review window. Reconfirm relevant recent evidence.':null;
  anchors.push({id:t.id,kind:'benchmark',...mapping,observedAt:t.date.toISOString(),source:'Saved benchmark record (reported; not independently verified)',usable:!reason,reason});
 }
 const fields=[['ftp','bike','power','W','Undated cycling FTP'],['runPaceBase','run','pace','sec/km','Undated running threshold pace'],['swimPaceBase','swim','pace','sec/100m','Undated swimming threshold/CSS pace'],['lthr',null,'hr','bpm','Undated LTHR; sport unknown']] as const;
 for(const [field,sport,metric,unit,context] of fields){const value=profile?.[field];if(typeof value==='number'&&Number.isFinite(value)&&value>0)anchors.push({id:`profile:${field}`,kind:'profile',sport,metric,unit,value,observedAt:null,context,source:'Legacy profile field; measurement date and protocol unavailable',usable:false,reason:'Context only. Supply a dated manual reference and confirm its applicability before calculating.'});}
 return anchors;
}
