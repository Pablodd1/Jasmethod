import {groupActivityEvidence,type ActivityDecision,type ActivityEvidenceRow} from './activity-evidence';

type CalendarWorkout=ActivityEvidenceRow & {id:string;userId:string;source?:string|null;title:string;planDay?:{plan:{id:string;status:string;userId:string}}|null;[key:string]:any};
/** Calendar visibility is not deletion, reconciliation or a report of rest. */
export function calendarWorkoutView(rows:CalendarWorkout[],ownerId:string,activePlanId:string|null,decisions:readonly ActivityDecision[]=[]) {
 const hasReport=(w:CalendarWorkout)=>w.completed===true||['feedbackAt','feedbackStatus','feedbackNote','actualDurationMin','actualSport','actualDetails','rpe','avgHr','maxHr','avgPower','np','distanceKm','preWeightKg','postWeightKg'].some(key=>w[key]!=null);
 const visible=rows.filter(w=>w.userId===ownerId).filter(w=>{
  if(hasReport(w))return true;
  if(['superseded-plan','superseded-starter','superseded-starter-rest'].includes(w.source||''))return false;
  if(w.planDay)return w.planDay.plan.userId===ownerId&&w.planDay.plan.status==='active'&&w.planDay.plan.id===activePlanId;
  return true;
 });
 const workouts:CalendarWorkout[]=visible.map(({planDay,...w})=>({...w,calendarState:hasReport(w)?'reported':w.planned?'planned':'unconfirmed'}));
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
