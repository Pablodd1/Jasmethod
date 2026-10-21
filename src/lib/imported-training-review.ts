/** Read-only import review. Possible cross-provider copies are never asserted to be one verified activity. */
import { addDaysKey, dateKey } from './dates';
import {groupActivityEvidence,type ActivityDecision,type ActivityEvidenceRow} from './activity-evidence';
import { derivedActivityPolicy } from './derived-activity-policy';
export type ImportedTrainingRow = ActivityEvidenceRow & { id: string; date: Date; sport: string; source: string | null; durationMin: number | null; actualDurationMin: number | null };
export function importedTrainingWindow(timezone: string, now = new Date()) {
 const today = dateKey(now, timezone);
 const weekday = new Date(`${today}T12:00:00Z`).getUTCDay();
 const endKey = addDaysKey(today, -((weekday + 6) % 7));
 return { startKey: addDaysKey(endKey, -28), endKey };
}
export function importedTrainingReview(rows: ImportedTrainingRow[], timezone: string, now = new Date(), truncated = false,decisions:readonly ActivityDecision[]=[]) {
 const window = importedTrainingWindow(timezone, now);
 const minutes = (row: ImportedTrainingRow) => {
  // These are completed, unplanned imports: durationMin is the original provider
  // duration, never planned minutes. Zero/invalid imports do not imply rest.
  const value = row.actualDurationMin ?? row.durationMin;
  return typeof value === 'number' && Number.isFinite(value) && value > 0 && value <= 1440 ? value : null;
 };
 const eligible = rows.filter(row => Number.isFinite(row.date.getTime()) && dateKey(row.date, timezone) >= window.startKey && dateKey(row.date, timezone) < window.endKey)
  .sort((a,b)=>a.date.getTime()-b.date.getTime() || a.id.localeCompare(b.id));
 const policy = derivedActivityPolicy(eligible);
 if (policy.status !== 'allowed') return {
  version:'imported-training-review-v1',timezone,...window,rawRecordCount:eligible.length,truncated,
  weeks:Array.from({length:4},(_,i)=>{
   const startKey=addDaysKey(window.startKey,i*7),endKey=addDaysKey(startKey,7);
   const records=eligible.filter(row=>dateKey(row.date,timezone)>=startKey&&dateKey(row.date,timezone)<endKey);
   return {startKey,endKey:addDaysKey(endKey,-1),rawRecordCount:records.length,recordedDays:null,
    unknownDurationRecords:null,possibleOverlapGroups:null,recordsInPossibleOverlap:null,
    minutesRange:{minimum:null,maximum:null},sources:[...new Set(records.map(row=>row.source??'unknown'))].sort(),
    overlaps:[] as {sport:string;startAt:string;records:{id:string;source:string|null;startedAt:string;minutes:number|null}[]}[]};
  }),possibleOverlapGroups:null,unknownDurationRecords:null,recordedWeeklyAverageMinutes:null,
  requiresAthleteReview:true,derivedActivityPolicy:policy,
  note:policy.reason+' Empty weeks, unrecorded days and unavailable durations are unknown, never confirmed rest. No profile or training is changed.'
 };
 const effective=groupActivityEvidence(eligible,decisions);
 const globalOverlaps=effective.pending;
 const weeks = Array.from({length:4},(_,i)=>{
  const startKey=addDaysKey(window.startKey,i*7),endKey=addDaysKey(startKey,7);
  const weekRows=eligible.filter(row=>dateKey(row.date,timezone)>=startKey&&dateKey(row.date,timezone)<endKey);
  const groups=effective.groups.filter(group=>dateKey(group.primary.date,timezone)>=startKey&&dateKey(group.primary.date,timezone)<endKey);
  const overlaps=globalOverlaps.filter(group=>group.some(row=>weekRows.includes(row)));
  const overlapIds=new Set(overlaps.flatMap(group=>group.map(row=>row.id)));
  const known=weekRows.filter(row=>minutes(row)!==null);
  const unknownDurationRecords=groups.filter(group=>group.budgetMinutes===null||group.budgetMinutes===0).length;
  const confirmed=groups.filter(group=>!group.unresolved).reduce((sum,group)=>sum+(group.budgetMinutes??0),0);
  const minimum=confirmed+overlaps.reduce((sum,group)=>sum+Math.max(0,...group.filter(row=>weekRows.includes(row)).map(row=>minutes(row)??0)),0);
  const maximum=groups.reduce((sum,group)=>sum+(group.budgetMinutes??0),0);
  return { startKey,endKey:addDaysKey(endKey,-1),rawRecordCount:weekRows.length,recordedDays:new Set(weekRows.map(row=>dateKey(row.date,timezone))).size,
   unknownDurationRecords,possibleOverlapGroups:overlaps.length,recordsInPossibleOverlap:overlapIds.size,
   minutesRange:{minimum:known.length?Math.round(minimum*10)/10:null,maximum:known.length&&!unknownDurationRecords?Math.round(maximum*10)/10:null},
   sources:[...new Set(weekRows.map(row=>row.source ?? 'unknown'))].sort(),
   overlaps:overlaps.slice(0,20).map(group=>({sport:group[0].sport,startAt:group[0].date.toISOString(),records:group.map(row=>({id:row.id,source:row.source,startedAt:row.date.toISOString(),minutes:minutes(row)}))})),
  };
 });
 const possibleOverlapGroups=globalOverlaps.length,unknownDurationRecords=weeks.reduce((sum,week)=>sum+week.unknownDurationRecords,0);
 const reviewableAverage=!truncated&&!possibleOverlapGroups&&!unknownDurationRecords&&weeks.every(week=>week.rawRecordCount>0)
  ? Math.round(weeks.reduce((sum,week)=>sum+week.minutesRange.minimum!,0)/4) : null;
 return {version:'imported-training-review-v1',timezone,...window,rawRecordCount:eligible.length,truncated,weeks,possibleOverlapGroups,unknownDurationRecords,
  derivedActivityPolicy:policy,
  recordedWeeklyAverageMinutes:reviewableAverage,requiresAthleteReview:true,
  note:'Recorded volume only, not training capacity or a prescription. Corroborated copies and current explicit choices count once; unresolved near-start records show possible-overlap ranges, not verified session counts. Empty weeks, unrecorded days and missing durations are unknown, never confirmed rest. Confirm completeness, tolerability and recovery before explicitly editing your baseline. No profile or training is changed.'};
}
