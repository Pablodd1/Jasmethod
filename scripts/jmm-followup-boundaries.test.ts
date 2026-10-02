/** Independent synthetic acceptance boundaries. No database or provider calls. */
import test from "node:test";
import assert from "node:assert/strict";
import { parseCommunicationSettings, scheduledInstant, dueSchedule, parseCoachingReply, missingDataQuestions, newReplyToken, verifyReplyBinding, mockTransport, mockCoachingEnabled } from "../src/lib/coaching-communication";
import { parsePlanningSetup, assessPlanningSetup } from "../src/lib/planning-setup";
import { parsePlanningTarget } from "../src/lib/planning-target";
import { buildTargetProgress, convertProgressRange, parseProgressReport } from "../src/lib/target-progress";
import { normalizeSportStructure, poolLengthMeters } from "../src/lib/sport-structure";

const now = new Date("2026-10-02T12:00:00Z");
const settings = {primaryChannel:"telegram",paused:false,dailyPlan:true,sessionFeedback:true,missingData:true,timezone:"America/New_York",minuteOfDay:90,quietStart:1320,quietEnd:60,declinedOptional:[],consentVersion:"mock-coaching-v1"};
const configured = () => parseCommunicationSettings(settings);
test("Communication consent is explicit, typed and production-inert", () => {
  assert.throws(()=>parseCommunicationSettings({...settings,consentVersion:undefined}));
  assert.throws(()=>parseCommunicationSettings({...settings,missingData:"true"}));
  assert.throws(()=>parseCommunicationSettings({...settings,declinedOptional:["newPain"]}));
  assert.throws(()=>parseCommunicationSettings({...settings,quietStart:1,quietEnd:1}));
  assert.throws(()=>parseCommunicationSettings({...settings,timezone:"not-a-timezone"}));
  assert.equal(mockCoachingEnabled({NODE_ENV:"test",ENABLE_MOCK_COACHING:"true",COACHING_TRANSPORT:"mock",VERCEL_ENV:"production"}),false);
  assert.equal(mockCoachingEnabled({NODE_ENV:"test",ENABLE_MOCK_COACHING:"true",COACHING_TRANSPORT:"live"}),false);
});
test("DST spring gap moves to first available wall-clock minute", () => {
  assert.equal(scheduledInstant("2026-03-08",{...configured(),minuteOfDay:150}).toISOString(),"2026-03-08T07:00:00.000Z");
});
test("DST autumn repeated hour resolves to first occurrence", () => {
  assert.equal(scheduledInstant("2026-11-01",configured()).toISOString(),"2026-11-01T05:30:00.000Z");
  const first = dueSchedule(configured(),new Date("2026-11-01T05:35:00Z"));
  const repeated = dueSchedule(configured(),new Date("2026-11-01T06:35:00Z"));
  assert.equal(first?.day,repeated?.day); assert.equal(first?.at.toISOString(),repeated?.at.toISOString());
});
test("Quiet hours defer across midnight without losing originating local day", () => {
  const s={...configured(),minuteOfDay:1380,quietStart:1320,quietEnd:420};
  assert.equal(scheduledInstant("2026-10-02",s).toISOString(),"2026-10-03T11:00:00.000Z");
  assert.equal(dueSchedule(s,new Date("2026-10-03T03:01:00Z")),null);
  assert.equal(dueSchedule(s,new Date("2026-10-03T11:01:00Z"))?.day,"2026-10-02");
  assert.equal(dueSchedule({...s,paused:true},new Date("2026-10-03T11:01:00Z")),null);
});
test("Reply binding independently checks every identity and one-time condition", () => {
  const token=newReplyToken(now);
  const prompt={userId:"synthetic-a",sessionId:"s1",observationDate:"2026-10-02",sourceRevision:"a".repeat(64),timezone:"UTC",tokenHash:token.hash,tokenExpiresAt:token.expiresAt,tokenUsedAt:null,status:"simulated",replyStatus:"none",channel:"telegram"};
  const input={userId:prompt.userId,sessionId:prompt.sessionId,observationDate:prompt.observationDate,sourceRevision:prompt.sourceRevision,timezone:prompt.timezone,token:token.token,actorId:"123",chatId:"123",verifiedActorId:"123",verifiedChatId:"123"};
  assert.doesNotThrow(()=>verifyReplyBinding(prompt,input,now));
  for(const key of ["userId","sessionId","observationDate","sourceRevision","timezone","actorId","chatId","token"] as const) assert.throws(()=>verifyReplyBinding(prompt,{...input,[key]:"wrong"},now),key);
  for(const patch of [{tokenUsedAt:now},{replyStatus:"draft"},{status:"unknown"},{status:"failed"},{tokenExpiresAt:now}]) assert.throws(()=>verifyReplyBinding({...prompt,...patch},input,now));
});
test("Unknown actuals remain absent; ambiguous/contradictory/narrative replies fail", () => {
  assert.deepEqual(parseCoachingReply("status=unknown; minutes=unknown; rpe=unknown; sport=unknown"),{status:"unknown",minutes:null,rpe:null,sport:null,declinedOptional:[]});
  for(const text of ["5","completed 20min no pain","status=completed; status=skipped","status=skipped; minutes=1","status=partial; rpe=11","status=completed; minutes=NaN","status=completed; symptoms=fever"]) assert.throws(()=>parseCoachingReply(text));
});
test("Declined optional input is not re-requested; safety questions remain app-only", () => {
  const q=missingDataQuestions({sport:"run",feedbackStatus:"unknown",hasAnchor:false,missingSafety:["newPain"],declinedOptional:["runBenchmark"]});
  assert.ok(q.some(x=>x.key==="newPain"&&x.appOnly&&!x.optional));
  assert.ok(!q.some(x=>x.key==="runBenchmark"));
  assert.ok(q.every(x=>x.question&&x.consequence));
});
test("Transport never upgrades rejected or unknown outcome to sent", () => {
  assert.equal(mockTransport("accepted").status,"simulated");
  assert.equal(mockTransport("failed").status,"failed");
  assert.equal(mockTransport("unknown").status,"unknown");
});
const target={metric:"pace",sport:"run",value:240,unit:"sec/km",context:"run5k",targetDate:"2026-12-01"};
const targetGoal=()=>parsePlanningTarget(target,now)!;
const setup=()=>parsePlanningSetup({adultConfirmed:true,profileConfirmed:true,goalDescription:"Run 5 km faster",baselineWeeklyMinutes:120,baselineObservedAt:"2026-10-01",interruptions:"none",restrictions:"none",qualifiedReview:"none_needed",trainingDays:[1,3,5],maxSessionMinutes:60,equipmentAccess:"Running shoes",planWeeks:8,targetGoal:target},now);
const profile={goal:"run-only",experience:"amateur",weeklyHours:3,birthYear:1990};
test("Numeric aspiration requires explicit baseline-only opt-in", () => {
  assert.equal(assessPlanningSetup(profile,setup(),now).ready,false);
  const opted={...setup(),baselinePlanOptIn:true};
  assert.equal(assessPlanningSetup(profile,opted,now).ready,true);
  assert.equal(assessPlanningSetup(profile,opted,now).planningBasis,"baseline_only");
  assert.equal(assessPlanningSetup({...profile,injured:true},opted,now).ready,false);
  assert.equal(assessPlanningSetup(profile,{...opted,baselineWeeklyMinutes:null},now).ready,false);
  assert.equal(assessPlanningSetup(profile,{...opted,restrictions:"unknown"},now).ready,false);
});
test("Goal is not substituted for missing or nonmatching capacity", () => {
  const v=buildTargetProgress({target:targetGoal(),benchmarks:[{id:"ftp",date:now,type:"ftp",result:240,skipped:false,completed:true}],now});
  assert.equal(v.benchmark,null);assert.equal(v.reported,null);assert.equal(v.target?.kind,"goal_not_capacity");
});
test("Comparison preserves direct source value and exact pace/speed inversion", () => {
  const v=buildTargetProgress({target:targetGoal(),benchmarks:[{id:"5k",date:now,type:"run5k",result:1500,skipped:false,completed:true,source:"athlete_reported"}],now});
  assert.equal(v.benchmark?.currentValue,300); assert.equal(v.benchmark?.remainingGap,60); assert.equal(v.benchmark?.observation.source,"athlete_reported");
  const [low,high]=convertProgressRange(240,300,"sec/km","km/h");
  assert.ok(Math.abs(low-12)<1e-10); assert.ok(Math.abs(high-15)<1e-10);
});
test("Stale/future/unfinished evidence cannot establish current comparison", () => {
  for (const entry of [{date:new Date("2026-06-01"),completed:true},{date:new Date("2026-10-03"),completed:true},{date:now,completed:false}]) {
    const v=buildTargetProgress({target:targetGoal(),benchmarks:[{id:"5k",type:"run5k",result:1500,skipped:false,...entry}],now}); assert.equal(v.benchmark,null);
  }
});
test("Manual measurements require context confirmation and actual observation date", () => {
  const report={value:5,unit:"min/km",observedAt:"2026-10-01",contextConfirmed:true};
  assert.equal(parseProgressReport(report,targetGoal(),now).value,5);
  for(const patch of [{contextConfirmed:false},{observedAt:"2026-10-03"},{value:0},{unit:"W"},{supersedesId:"other"}]) assert.throws(()=>parseProgressReport({...report,...patch},targetGoal(),now));
});
test("Explicit pool units are exact and send-off is not converted to fixed rest", () => {
  const structure=normalizeSportStructure({schemaVersion:1,kind:"pool",poolLength:{value:25,unit:"yd"},steps:[{kind:"lengths",name:"Freestyle",phase:"active",zone:"z2",lengths:4,stroke:"freestyle",sendOffSeconds:120}]},"swim");
  assert.equal(structure.kind,"pool"); if(structure.kind!=="pool")return;
  assert.equal(poolLengthMeters(structure.poolLength),22.86); assert.equal(structure.steps.length,1); assert.equal(structure.steps[0].kind,"lengths");
});
test("Ambiguous legacy structure, fractional lengths and noncontiguous sets reject", () => {
  assert.throws(()=>normalizeSportStructure({schemaVersion:1,kind:"strength",steps:[{text:"2 lifts, 4 sets x 5"}]},"strength"));
  assert.throws(()=>normalizeSportStructure({schemaVersion:1,kind:"pool",poolLength:{value:25,unit:"m"},steps:[{kind:"lengths",name:"Swim",phase:"active",zone:"z2",lengths:1.5,stroke:"freestyle"}]},"swim"));
  assert.throws(()=>normalizeSportStructure({schemaVersion:1,kind:"strength",steps:[{kind:"set",exerciseId:"squat",exerciseName:"Squat",setNumber:2,zone:"z2",endpoint:{type:"reps",reps:5}}]},"strength"));
});
