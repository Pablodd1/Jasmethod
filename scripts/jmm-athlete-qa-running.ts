/** Fifth synthetic athlete: no-device beginner runner and cross-app acceptance. */
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { existsSync,readFileSync,writeFileSync } from 'node:fs';
import { actor,api,save,scenario,finish,db,base,dayKey,observedKey,validAnswers,type Actor } from './jmm-athlete-qa-support';
let runner: Actor, sessionId='';
const evidence:Record<string,unknown>={synthetic:true,liveDeviceReceiptVerified:false};
const raceKey=new Date(new Date(dayKey+'T00:00:00Z').getTime()+56*86400000).toISOString().slice(0,10);
const privateFile='.local/athlete-qa/running-private.json';
async function raw(path:string,body?:unknown,method?:string,cookie=runner.cookie){return fetch(base+path,{method:method||(body===undefined?'GET':'POST'),headers:{cookie,'Content-Type':'application/json',origin:base},...(body===undefined?{}:{body:JSON.stringify(body)}),signal:AbortSignal.timeout(120000)});}
async function main(){
 runner=existsSync(privateFile)?JSON.parse(readFileSync(privateFile,'utf8')):await actor('running');
 const own=await db.user.findUniqueOrThrow({where:{id:runner.id}});assert.match(own.email,/^athlete-qa-running-.*@example\.invalid$/);
 await db.$transaction([db.workout.deleteMany({where:{userId:runner.id}}),db.trainingPlan.deleteMany({where:{userId:runner.id}}),db.benchmarkTest.deleteMany({where:{userId:runner.id}}),db.race.deleteMany({where:{userId:runner.id}}),db.dailyCheckin.deleteMany({where:{userId:runner.id}}),db.auditLog.deleteMany({where:{subjectId:runner.id}}),db.athleteProfile.deleteMany({where:{userId:runner.id}}),db.athleteProfile.create({data:{userId:runner.id}}),db.user.update({where:{id:runner.id},data:{onboarded:false}})]);
 await scenario('New runner sees optional import-first empty data without invented capacity',async()=>{
  const [p,review,onboard]=await Promise.all([api('/api/profile',runner),api('/api/onboard/import-review',runner),api('/api/onboard',runner)]);
  assert.equal(onboard.onboarded,false);assert.equal(review.history.count,0);assert.equal(p.profile.runPaceBase,null);assert.equal(p.profile.maxHr,null);evidence.empty={review,onboard};
 });
 await scenario('Skipping devices and nonessential details still creates a held beginner day-zero run',async()=>{
  await save(runner,{goal:'5k',experience:'beginner'});await api('/api/onboard',runner,{});
  const today=await api('/api/today',runner);const session=today.sessions.find((s:any)=>s.sport==='run');assert.ok(session);assert.ok(session.durationMin<=20);assert.notEqual(session.verdict,'ready');
  await api('/api/checkin',runner,validAnswers);const ready=await api('/api/today',runner);assert.equal(ready.sessions.find((s:any)=>s.id===session.id).verdict,'ready');assert.equal(await db.trainingPlan.count({where:{userId:runner.id}}),0);evidence.dayZero=ready;
 });
 await scenario('Useful manual beginner profile accepts no watch and no weekly-hour requirement',async()=>{
  const result=await save(runner,{birthYear:1990,sex:'female',heightCm:168,weightKg:63,experience:'beginner',goal:'5k',units:'metric',hasGpsWatch:false,maxHr:190,restingHr:58,trainingWindow:'morning',notes:'Synthetic athlete. Manual results; no connected device. Prior 3 months of easy walk/run without symptoms.',setup:{adultConfirmed:true,profileConfirmed:true,goalDescription:'Comfortably complete a 5K and later a 10K; avoid excessive fatigue',baselineWeeklyMinutes:150,baselineObservedAt:observedKey,interruptions:'none',restrictions:'none',qualifiedReview:'none_needed',trainingDays:[0,1,2,3,4,5,6],maxSessionMinutes:45,equipmentAccess:'Safe flat route, running shoes and bodyweight space',planWeeks:8,targetGoal:{metric:'completion',sport:'run',targetDate:raceKey},travel:{startDate:null,endDate:null,destinationTimezone:null,equipmentNotes:'Walking and running route available',timeNotes:'Early mornings; can edit Wednesday double day',maxSessionMinutes:null}}});
  assert.equal(result.planningReadiness.ready,true);assert.equal(result.profile.ftp,null);evidence.profile=result;
 });
 await scenario('Dated 5K benchmark explicitly applies a derived reference, not measured threshold',async()=>{
  const p=await api('/api/profile',runner);const test=await api('/api/benchmarks',runner,{action:'record',type:'run5k',name:'Synthetic completed 5K field run',date:observedKey,result:1800,applyBaseline:true,expectedRevision:p.revision,reason:'Synthetic athlete-entered result, not lab verified'});
  assert.equal(test.baselineApplied,true);const after=await api('/api/profile',runner);assert.equal(after.profile.runPaceBase,382);evidence.benchmark={test,provenance:after.provenance};
 });
 await scenario('Athlete saves 5K and 10K races and sees dated events before cycle confirmation',async()=>{
  const firstDate=new Date(new Date(dayKey+'T00:00:00Z').getTime()+28*86400000).toISOString().slice(0,10);
  await api('/api/races',runner,{name:'Synthetic 5K tune-up',distance:'5k',date:firstDate,priority:2,location:'Synthetic flat park',goalTimeMin:30,notes:'Athlete-entered; course/weather unverified'});
  await api('/api/races',runner,{name:'Synthetic 10K completion',distance:'10k',date:raceKey,priority:1,location:'Synthetic city course',goalTimeMin:65,notes:'Athlete goal, not forecast'});
  const list=await api('/api/races',runner);assert.equal(list.races.length,2);assert.ok(list.races.every((r:any)=>r.weather===null));evidence.races=list;
 });
 await scenario('Eight-week run cycle preview is bounded, beginner rest preserved and explicit confirmation required',async()=>{
  await api('/api/plan/generate',runner,{distance:'5k',weeks:8,startDate:dayKey},undefined,409);
  const draft=await api('/api/plan/generate',runner,{distance:'5k',weeks:8,startDate:dayKey,easyPct:70,preview:true});
  assert.equal(draft.preview.weeksPreview.length,8);assert.equal(await db.trainingPlan.count({where:{userId:runner.id}}),0);
  for(const week of draft.preview.weeksPreview){assert.ok(week.totalMinutes<=150);for(const s of week.sessions){assert.ok(s.minutes<=45);assert.ok(['run','strength','mobility','recovery'].includes(s.sport));}}
  const saved=await api('/api/plan/generate',runner,{distance:'5k',weeks:8,startDate:dayKey,easyPct:70,previewToken:draft.previewToken,...(draft.eventTradeoffAgreementRequired?{confirmEventTradeoffs:true}:{})});
  const plan=await api('/api/plan',runner);assert.equal(plan.plans.length,1);assert.equal(plan.plans[0].weeks,8);
  const weekDays=plan.plans[0].days.slice(0,7);assert.ok(weekDays.filter((d:any)=>d.dayOff).length>=2,'Beginner cycle needs at least two rest days');
  const today=await api('/api/today',runner);sessionId=today.sessions.find((s:any)=>s.sport==='run')?.id||'';assert.ok(sessionId,'First active cycle run is available today');evidence.cycle={draft,planId:saved.plan.id,today};
 });
 await scenario('Current check-in, focus preparation and workout card use one saved canonical running session',async()=>{
  const check=await api('/api/checkin',runner,{...validAnswers,availableMinutes:35});const view=await api(`/api/v1/training/today?sessionId=${sessionId}`,runner);assert.equal(view.session.verdict,'ready');assert.ok(view.session.totalMinutes<=35);assert.ok(view.workoutCard.session.steps.length>0);
  await api(`/api/v1/training/sessions/${sessionId}/focus`,runner,{ready:true,expectedRevision:view.session.sourceRevision});const focused=await api(`/api/v1/training/today?sessionId=${sessionId}`,runner);assert.equal(focused.completion.focusReady,true);evidence.training={check,session:focused.session,card:focused.workoutCard};
 });
 await scenario('J Koach answers owner testing/coaching referrals and remembers useful runner context',async()=>{
  const testing=await api('/api/assistant',runner,{message:'Where can I do my VO2max testing?',source:'text',externalConsent:false,clientRequestId:randomUUID()});assert.match(testing.answer,/786.?231.?7906/);assert.match(testing.answer,/Eric/);
  const coaching=await api('/api/assistant',runner,{message:'I need coaching guidance, who can I call?',source:'text',externalConsent:false,clientRequestId:randomUUID()});assert.match(coaching.answer,/786.?970.?8366/);
  const context=await api('/api/assistant',runner,{message:'What is my current running goal?',source:'text',externalConsent:false,clientRequestId:randomUUID()});assert.ok(context.answer.length>30);evidence.coach={testing,coaching,context};
 });
 await scenario('Conversational profile change is proposed, confirmed explicitly and not silently saved',async()=>{
  const before=await api('/api/profile',runner);const result=await api('/api/assistant',runner,{message:'My weight is 64 kg.',source:'text',externalConsent:false,clientRequestId:randomUUID()});assert.ok(result.proposal?.candidates?.length);assert.equal((await api('/api/profile',runner)).profile.weightKg,before.profile.weightKg);
  const p=result.proposal;const confirm=await api('/api/assistant/confirm',runner,{proposalId:p.id,expectedRevision:p.revision,candidates:p.candidates,idempotencyKey:randomUUID(),confirmed:true});assert.equal((await api('/api/profile',runner)).profile.weightKg,64);assert.equal(confirm.applied,true);evidence.confirmation=confirm;
 });
 await scenario('Runner records actual result without replacing prescription, then sees history and future calendar',async()=>{
  // Confirmed weight changes require a fresh check-in before execution.
  await api('/api/checkin',runner,{...validAnswers,availableMinutes:35});const view=await api(`/api/v1/training/today?sessionId=${sessionId}`,runner);const before=await db.workout.findUniqueOrThrow({where:{id:sessionId}});
  await api(`/api/v1/training/sessions/${sessionId}/completion`,runner,{expectedRevision:view.session.sourceRevision,actual:{status:'completed',actualSport:'run',durationMinutes:24,sessionRpe:3,comments:'Synthetic comfortable run/walk, no pain, no wearable'}});
  const after=await db.workout.findUniqueOrThrow({where:{id:sessionId}});assert.equal(after.completed,true);assert.equal(after.actualDurationMin,24);assert.equal(after.rpe,3);assert.equal(after.durationMin,before.durationMin);
  const history=await api(`/api/checkin?feedbackDate=${dayKey}`,runner);assert.equal(history.previousSessions.find((s:any)=>s.id===sessionId).feedbackStatus,'completed');const calendar=await api('/api/calendar?month=auto',runner);assert.ok(calendar.plan.days.some((d:any)=>d.date.slice(0,10)>dayKey));evidence.results={completed:after.completed,plannedMinutes:after.durationMin,actualMinutes:after.actualDurationMin,feedback:history,calendarDays:calendar.plan.days.length};
 });
 await scenario('Honest race scenarios remain available but unvalidated numeric personalized prediction stays disabled',async()=>{
  const [forecast,workspace]=await Promise.all([api('/api/race-forecast?distance=5k',runner),api('/api/race-scenarios',runner)]);assert.equal(forecast.forecast,null);assert.equal(forecast.reason,'personalized_forecasts_disabled');assert.ok(workspace.revision);evidence.forecast=forecast;
 });
 await scenario('Future plan remains visible but cannot become a fabricated completed activity today',async()=>{
  const future=await db.workout.findFirstOrThrow({where:{userId:runner.id,date:{gt:new Date(dayKey+'T23:59:59Z')},durationMin:{gt:0}},orderBy:{date:'asc'}});
  const view=await api(`/api/v1/training/today?sessionId=${future.id}`,runner);assert.notEqual(view.session.verdict,'ready');
  await api(`/api/v1/training/sessions/${future.id}/completion`,runner,{expectedRevision:view.session.sourceRevision,actual:{status:'completed',actualSport:future.sport,durationMinutes:20,sessionRpe:3}},undefined,409);
  await api('/api/plan',runner,{sessionId:future.id,feedbackStatus:'completed',actualDurationMin:20},'PUT',409);
  const after=await db.workout.findUniqueOrThrow({where:{id:future.id}});assert.equal(after.completed,false);assert.equal(after.actualDurationMin,null);assert.equal(after.feedbackAt,null);
  evidence.futureResults={day:future.date.toISOString(),verdict:view.session.verdict,completionStatus:409,sharedPlanFeedbackStatus:409,actualUnchanged:true};
 });
 await scenario('Paused reminders and disabled live sync do not claim Telegram, email or watch success',async()=>{
  const prefs=await api('/api/coaching/preferences',runner);assert.equal(prefs.preferences.paused,true);assert.equal(prefs.externalDeliveryEnabled,false);const legacy=await api('/api/reminders',runner);assert.equal(legacy.automatedDeliveryEnabled,false);
  const connections=await api('/api/connectors',runner);for(const p of connections.providers){assert.notEqual(p.capabilities?.automaticDeviceDelivery,true);}evidence.delivery={prefs,legacy,connections};
 });
 await scenario('Invalid inputs and unauthenticated API requests return actionable status, not 500',async()=>{
  for(const path of ['/api/today','/api/profile','/api/assistant','/api/calendar','/api/coaching/preferences']){const r=await raw(path,undefined,undefined,'');assert.equal(r.status,401,path);assert.ok((await r.json()).error);}
  await api('/api/calendar',runner,{title:'Synthetic invalid event',date:'not-a-date'},undefined,400);await api('/api/calendar?month=2026-99',runner,undefined,undefined,400);await api('/api/v1/training/today?sessionId=',runner,undefined,undefined,400);await api('/api/benchmarks',runner,{action:'record',type:'run5k',date:observedKey,result:-1},undefined,400);await api('/api/checkin',runner,{...validAnswers,availableMinutes:-1},undefined,400);
 });
 await scenario('Another synthetic athlete cannot expose selected runner sessions or private conversation',async()=>{
  const file=['cycling','swimming','hyrox','triathlon'].map(s=>`.local/athlete-qa/${s}-private.json`).find(existsSync);assert.ok(file,'Another synthetic fixture is required');const other=JSON.parse(readFileSync(file,'utf8')) as Actor;
  await api(`/api/v1/training/today?sessionId=${sessionId}`,other,undefined,undefined,404);await api(`/api/assistant?athleteId=${runner.id}`,other,undefined,undefined,403);
  const w=await db.workout.findFirst({where:{userId:other.id}});if(w)await api(`/api/workout/structure?id=${w.id}`,runner,undefined,undefined,404);
  evidence.tenantIsolation={otherSynthetic:true,selectedSession404:true,privateConversation403:true};
 });
}
main().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>{writeFileSync('.local/athlete-qa/running-evidence.json',JSON.stringify(evidence,null,2));await finish('running');});
