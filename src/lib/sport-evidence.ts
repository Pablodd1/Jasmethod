import { groupActivityEvidence, activityActualMinutes,ACTIVITY_EVIDENCE_SELECT, type ActivityDecision, type ActivityEvidenceRow } from "./activity-evidence";
import { createHash } from "node:crypto";
import { isDerivedActivityEligible, derivedActivityPolicy } from "./derived-activity-policy";
import { EVIDENCE_SPORTS, readSportMeasurements, speedFromDistance, type SportMeasurements } from "./sport-measurements";
export interface SportRow extends ActivityEvidenceRow {
  id:string;userId:string;sport:string;actualDetails?:string|null;avgHr?:number|null;maxHr?:number|null;avgPower?:number|null;np?:number|null;calories?:number|null;rawEvidenceRevision?:string;
}
export const SPORT_RECORD_SELECT={...ACTIVITY_EVIDENCE_SELECT,actualDetails:true,avgHr:true,maxHr:true,avgPower:true,np:true,calories:true} as const;
export function sportRowRevision(row:SportRow) {
  return createHash("sha256").update(JSON.stringify(Object.keys(SPORT_RECORD_SELECT).sort().map(key=>[key,(row as any)[key]??null]))).digest("hex");
}
const valid=(v:unknown,min:number,max:number):number|null=>typeof v==="number"&&Number.isFinite(v)&&v>=min&&v<=max?v:null;
/** A source-only result card. Never include it in model messages or external coaching context. */
export function sportEvidence(rows:SportRow[],userId:string,decisions:ActivityDecision[]=[],now=new Date(),truncated=false) {
  const since=now.getTime()-90*86400000,recent=now.getTime()-30*86400000;
  const actual=rows.filter(r=>r.userId===userId&&new Date(r.date).getTime()>=since&&new Date(r.date).getTime()<=now.getTime()&&
    activityActualMinutes(r)!==null&&(r.completed||["completed","partial","substituted"].includes(r.feedbackStatus||"")||r.actualDurationMin!=null));
  return EVIDENCE_SPORTS.map(sport=>{
    const raw=actual.filter(r=>(r.actualSport||r.sport)===sport).sort((a,b)=>new Date(b.date).getTime()-new Date(a.date).getTime()||Number(b.source==="garmin_direct")-Number(a.source==="garmin_direct")||a.id.localeCompare(b.id));
    const policy=derivedActivityPolicy(raw),grouped=groupActivityEvidence(raw,decisions),pendingIds=new Set(grouped.pending.flat().map(r=>r.id));
    const records=grouped.effective.map(r=>{
      let detail:SportMeasurements|null=readSportMeasurements(r.actualDetails,sport,r.source);
      let distance=valid(r.distanceKm,0,1500),manualAnnotations=false,annotationConflict=false,supplemented=false;
      try {const d=JSON.parse(r.actualDetails||"null");if(d?.schemaVersion===1&&d.source==="athlete_report"&&d.values?.distanceKm!=null)distance=valid(d.values.distanceKm,0,1500);
        manualAnnotations=d?.schemaVersion===1&&d.source==="athlete_report"&&!["manual","manual_sport_local"].includes(r.source||"");
        supplemented=r.distanceKm==null&&d?.manualDistanceEvidence?.version===1&&d.manualDistanceEvidence.distanceKm===distance&&distance!==null;
        annotationConflict=manualAnnotations&&distance!==r.distanceKm&&!supplemented;
        // Athlete corrections are retained separately from the provider's measurement.
        if(r.source==="garmin_direct"&&d?.source==="athlete_report"&&annotationConflict)detail=null;
        if(detail&&supplemented)detail={...detail,distanceKm:distance,averageSpeedKmh:speedFromDistance(distance,detail.durationSeconds)};
      }catch{/* Missing quantities stay unknown. */}
      const minutes=activityActualMinutes(r)!;
      const evidenceMinutes=detail?(r.source==="garmin_direct"?Math.max(1,Math.round(detail.durationSeconds/60)):Math.ceil(detail.durationSeconds/60)):null;
      if(detail&&(detail.distanceKm!==distance||evidenceMinutes!==minutes))detail=null;
      const seconds=detail?.durationSeconds??minutes*60,allowed=isDerivedActivityEligible(r)&&!pendingIds.has(r.id);
      const speed=allowed?speedFromDistance(distance,seconds):null;
      return {id:r.id,revision:r.rawEvidenceRevision??sportRowRevision(r),observedAt:new Date(r.date).toISOString(),source:r.source||"unknown",manualAnnotations,annotationConflict,supplemented,precision:detail?"exact" as const:"whole_minutes" as const,
        durationSeconds:seconds,durationBasis:detail?.durationBasis??"stored_minutes",distanceKm:distance,averageSpeedKmh:speed,
        speedReported:detail?.reported.includes("speed")??false,distanceCalculated:detail?!detail.reported.includes("distance"):false,derivedAllowed:allowed,
        avgHr:valid(r.avgHr,20,250),maxHr:valid(r.maxHr,20,250),avgPower:valid(r.avgPower,0,5000),np:valid(r.np,0,5000),calories:valid(r.calories,0,50000),
        cadence:detail?.cadence??null,poolLengthM:detail?.poolLengthM??null,environment:detail?.environment??null,elevationGainM:detail?.elevationGainM??null,
        stale:now.getTime()-new Date(r.date).getTime()>30*86400000};
    }).sort((a,b)=>b.observedAt.localeCompare(a.observedAt));
    const eligible=records.filter(r=>new Date(r.observedAt).getTime()>=recent),complete=!truncated&&policy.status==="allowed"&&!grouped.unresolvedGroups&&!records.some(r=>r.annotationConflict);
    const fields=["averageSpeedKmh","distanceKm","avgHr","avgPower","cadence","poolLengthM","elevationGainM"] as const;
    const latest=Object.fromEntries(fields.map(field=>{const row=records.find(r=>r[field]!==null);return [field,row?{value:row[field],observedAt:row.observedAt,source:row.source,manualAnnotations:row.manualAnnotations,precision:row.precision,durationBasis:row.durationBasis,stale:row.stale,calculated:field==="averageSpeedKmh"?!row.speedReported:field==="distanceKm"?row.distanceCalculated:false}:null];}));
    return {sport,records:records.slice(0,10),latest,coverage:{days:90,truncated,rawRecords:raw.length,groupedCopies:grouped.groupedCopies,unresolvedGroups:grouped.unresolvedGroups,restricted:policy.status!=="allowed"},
      recent:{days:30,sessions:complete?eligible.length:null,distanceKm:complete&&eligible.length>0&&eligible.every(r=>r.distanceKm!==null)?eligible.reduce((sum,r)=>sum+r.distanceKm!,0):null,
        durationSeconds:complete&&eligible.length>0?eligible.reduce((sum,r)=>sum+r.durationSeconds,0):null,approximate:eligible.some(r=>r.precision==="whole_minutes"),complete}};
  });
}
