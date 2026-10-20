import {groupActivityEvidence,type ActivityDecision,type ActivityEvidenceRow} from './activity-evidence';
import type { Prisma } from '@prisma/client';

type CalendarWorkout=ActivityEvidenceRow & {id:string;userId:string;source?:string|null;title:string;planDay?:{plan:{id:string;status:string;userId:string}}|null;[key:string]:any};
const reportFields = ['feedbackAt','feedbackStatus','feedbackNote','actualDurationMin','actualSport','actualDetails','rpe','avgHr','maxHr','avgPower','np','distanceKm','calories','preWeightKg','postWeightKg','externalId','matchedPlanId'] as const;
const retiredSources = ['superseded-plan','superseded-starter','superseded-starter-rest'];
export function hasWorkoutReport(workout:Record<string,any>) {
 return workout.completed===true||reportFields.some(key=>workout[key]!=null);
}
export function isCurrentWorkout(workout:{userId?:string;source?:string|null;planDay?:{plan?:{id:string;status:string;userId:string}}|null;[key:string]:any},ownerId:string,activePlanId:string|null) {
 if(workout.userId!==ownerId)return false;
 if(retiredSources.includes(workout.source||''))return false;
 if(workout.planDay){const plan=workout.planDay.plan;return !!plan&&plan.userId===ownerId&&plan.status==='active'&&plan.id===activePlanId;}
 return true;
}
export function isCurrentOrReportedWorkout(workout:Parameters<typeof isCurrentWorkout>[0],ownerId:string,activePlanId:string|null) {
 return workout.userId===ownerId&&(hasWorkoutReport(workout)||isCurrentWorkout(workout,ownerId,activePlanId));
}
export function currentWorkoutWhere(ownerId:string,activePlanId:string|null):Prisma.WorkoutWhereInput {
 return {userId:ownerId,AND:[{OR:[{source:null},{source:{notIn:retiredSources}}]},
  {OR:[{planDay:null},...(activePlanId?[{planDay:{plan:{id:activePlanId,userId:ownerId,status:'active'}}}]:[])]}]};
}
/** Apply before a query's limit so retired suggestions cannot crowd out current
 * sessions. Actual/source evidence remains available even from an older plan. */
export function currentOrReportedWorkoutWhere(ownerId:string,activePlanId:string|null):Prisma.WorkoutWhereInput {
 return {userId:ownerId,OR:[
  {completed:true},...reportFields.map(field=>({[field]:{not:null}})),
  currentWorkoutWhere(ownerId,activePlanId),
 ]};
}
/** Calendar visibility is not deletion, reconciliation or a report of rest. */
export function calendarWorkoutView(rows:CalendarWorkout[],ownerId:string,activePlanId:string|null,decisions:readonly ActivityDecision[]=[]) {
 const visible=rows.filter(w=>isCurrentOrReportedWorkout(w,ownerId,activePlanId));
 const workouts:CalendarWorkout[]=visible.map(({planDay,...w})=>({...w,calendarState:hasWorkoutReport(w)?'reported':w.planned?'planned':'unconfirmed'}));
 // The same evidence rules used by coaching apply here. Pending components
 // are only visual review bundles: no durations are summed or identity chosen.
 const evidence=groupActivityEvidence(workouts,decisions),byId=new Map(workouts.map(w=>[w.id,w]));
 const bundles:{members:CalendarWorkout[];pending:boolean}[]=[];
 for(const item of [...evidence.pending.map(members=>({members,pending:true})),...evidence.groups.filter(g=>g.members.length>1).map(g=>({members:g.members,pending:false}))]){
  const ids=new Set(item.members.map(w=>w.id));
  const overlaps=bundles.filter(b=>b.members.some(w=>ids.has(w.id)));
  const members=[...new Map([...item.members,...overlaps.flatMap(b=>b.members)].map(w=>[w.id,w])).values()];
  for(const overlap of overlaps)bundles.splice(bundles.indexOf(overlap),1);
  bundles.push({members,pending:item.pending||overlaps.some(b=>b.pending)});
 }
 const bundledIds=new Set(bundles.flatMap(bundle=>bundle.members.map(w=>w.id)));
 const displayWorkouts=workouts.filter(w=>!bundledIds.has(w.id));
 for(const bundle of bundles){
  const primary=byId.get(bundle.members[0].id)!;
  const sources=[...new Set(bundle.members.map(w=>w.source||'unknown'))];
  displayWorkouts.push({id:primary.id,userId:primary.userId,date:primary.date,sport:primary.actualSport||primary.sport,title:`${primary.actualSport||primary.sport}: ${bundle.pending?'Possible copies':'Linked source records'} (${bundle.members.length})`,durationMin:null,actualDurationMin:null,completed:false,calendarState:bundle.pending?'review':'reported',calendarGroup:{pending:bundle.pending,recordIds:bundle.members.map(w=>w.id),sources},source:sources.join(' + ')});
 }
 return {workouts,displayWorkouts:displayWorkouts.sort((a,b)=>new Date(a.date).getTime()-new Date(b.date).getTime()),hiddenUnperformed:rows.filter(w=>w.userId===ownerId).length-workouts.length,possibleCopyGroups:evidence.unresolvedGroups};
}
