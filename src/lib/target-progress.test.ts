import {test} from "node:test";
import assert from "node:assert/strict";
import {parsePlanningTarget} from "./planning-target";
import {parsePlanningSetup,assessPlanningSetup} from "./planning-setup";
import {benchmarkObservation,buildTargetProgress,convertProgressValue,convertProgressRange,parseProgressReport,type ProgressObservation,type ProgressBenchmark} from "./target-progress";
import {targetProgressRevision} from "./target-progress-store";
const now=new Date("2026-10-02T12:00:00Z");
const run=()=>parsePlanningTarget({metric:"pace",sport:"run",value:270,unit:"sec/km",context:"run5k",targetDate:"2026-12-01"},now)!;
const bench=(patch:Partial<ProgressBenchmark>={}):ProgressBenchmark=>({id:"test-a",date:new Date("2026-10-01T12:00:00Z"),type:"run5k",result:1500,skipped:false,completed:true,source:"athlete_reported",enteredAt:"2026-10-02T10:00:00Z",...patch});
const report=(patch:Partial<ProgressObservation>={}):ProgressObservation=>({id:"report-a",metric:"pace",sport:"run",context:"run5k",value:4.8,unit:"min/km",observedAt:"2026-10-02",enteredAt:now.toISOString(),source:"athlete_reported",sourceRecord:"manual_report",label:"Separately reported result",...patch});
const view=(patch:Partial<Parameters<typeof buildTargetProgress>[0]>={})=>buildTargetProgress({target:run(),benchmarks:[bench()],now,...patch});
const close=(a:number,b:number)=>assert.ok(Math.abs(a-b)<1e-10,`${a} != ${b}`);

test("pace conversions keep decimal minutes, exact international mile and yard definitions",()=>{
 close(convertProgressValue(5.5,"min/km","sec/km"),330);
 close(convertProgressValue(8,"min/mi","sec/km"),480/1.609344);
 close(convertProgressValue(100,"sec/100yd","sec/100m"),100/0.9144);
 close(convertProgressValue(convertProgressValue(300,"sec/km","min/mi"),"min/mi","sec/km"),300);
 close(convertProgressValue(10,"mph","km/h"),16.09344);
 close(convertProgressValue(100,"W","W"),100);
});
test("pace to speed conversion inverts ranges and never confuses seconds with minutes",()=>{
 close(convertProgressValue(300,"sec/km","km/h"),12);
 assert.deepEqual(convertProgressRange(240,300,"sec/km","m/s"),[1000/300,1000/240]);
 assert.throws(()=>convertProgressRange(301,300,"sec/km","km/h"));
 for(const n of [0,-1,NaN,Infinity]) assert.throws(()=>convertProgressValue(n,"sec/km","km/h"));
 assert.throws(()=>convertProgressValue(300,"W","km/h"));
 assert.throws(()=>convertProgressValue(300,"bogus" as any,"km/h"));
});
test("5k pace is source-backed average, not derived threshold or athlete target",()=>{
 const v=view();assert.equal(v.benchmark?.currentValue,300);assert.equal(v.target?.value,270);assert.equal(v.benchmark?.remainingGap,30);
 assert.equal(v.benchmark?.observation.formula,"5 km total seconds / 5; exact distance-average conversion, not a threshold estimate");
 assert.equal(v.benchmark?.observation.source,"athlete_reported");assert.equal(v.benchmark?.observation.observedAt,"2026-10-01T12:00:00.000Z");
 assert.equal(v.reported,null);assert.equal(v.horizon.daysRemaining,60);assert.equal(v.horizon.state,"future");
 assert.equal("confidence" in v,false);assert.equal("predictedSuccessDate" in v,false);
});
test("power and speed comparisons require matching source context",()=>{
 const target=parsePlanningTarget({metric:"power",sport:"bike",value:300,unit:"W",context:"ftp"},now)!;
 const v=view({target,benchmarks:[bench({type:"ftp",result:250})]});assert.equal(v.benchmark?.remainingGap,50);
 const speed=parsePlanningTarget({metric:"speed",sport:"run",value:13,unit:"km/h",context:"run5k"},now)!;
 assert.equal(view({target:speed}).benchmark?.currentValue,12);assert.equal(view({target:speed}).benchmark?.remainingGap,1);
 const swim=parsePlanningTarget({metric:"pace",sport:"swim",value:90,unit:"sec/100m",context:"swim_threshold"},now)!;
 assert.equal(view({target:swim,benchmarks:[bench({type:"swim",result:100})]}).benchmark?.remainingGap,10);
});
test("missing, wrong-sport, unknown-context, CP, incomplete and skipped benchmarks never substitute",()=>{
 for (const benchmarks of [[],[bench({type:"ftp",result:250})],[bench({type:"cp",result:250})],[bench({completed:false})],[bench({skipped:true})],[bench({result:null})],[bench({result:NaN})]]) {const v=view({benchmarks});assert.equal(v.benchmark,null);assert.match(v.benchmarkReason!,/No completed benchmark/);}
 const target={...run(),context:undefined};assert.match(view({target}).benchmarkReason!,/context/);
 assert.equal(benchmarkObservation(bench({date:new Date("invalid")})),null);
});
test("90-day freshness boundary and same-day future observations fail closed",()=>{
 assert.ok(view({benchmarks:[bench({date:new Date("2026-07-04T12:00:00Z")})]}).benchmark);
 for(const date of [new Date("2026-07-03T12:00:00Z"),new Date("2026-10-03T00:00:00Z"),new Date("2026-10-02T13:00:00Z")]) {const v=view({benchmarks:[bench({date})]});assert.equal(v.benchmark,null);assert.match(v.benchmarkReason!,/stale/);}
});
test("manual reports stay separate and are not used to fill a missing benchmark",()=>{
 const v=view({benchmarks:[],reports:[report()]});assert.equal(v.benchmark,null);assert.equal(v.reported?.currentValue,288);assert.equal(v.reported?.remainingGap,18);assert.equal(v.reported?.observation.sourceRecord,"manual_report");
 const withBenchmark=view({reports:[report()]});assert.equal(withBenchmark.benchmark?.currentValue,300);assert.equal(withBenchmark.reported?.currentValue,288);
});
test("corrections are retained while only latest unreplaced result informs comparison",()=>{
 const v=view({reports:[report(),report({id:"report-b",value:4.9,supersedesId:"report-a",note:"Corrected transcription"})]});
 assert.equal(v.reported?.currentValue,294);assert.equal(v.reported?.observation.id,"report-b");assert.equal(v.observations.length,3);assert.deepEqual(v.supersededIds,["report-a"]);
});
test("custom contexts do not silently compare unlike distances, conditions or methods",()=>{
 const target=parsePlanningTarget({metric:"speed",sport:"bike",value:30,unit:"km/h",context:"custom",contextDescription:"20 km flat route with power meter"},now)!;
 const row=report({metric:"speed",sport:"bike",context:"custom",contextDescription:"10 km downhill",value:32,unit:"km/h"});
 assert.equal(view({target,reports:[row]}).reported,null);
 assert.equal(view({target,reports:[{...row,contextDescription:target.contextDescription}]}).reported?.status,"at_or_beyond_target");
});
test("no invented date, horizon, success probability or goal achievement from absent evidence",()=>{
 const target={...run(),targetDate:undefined};const v=view({target,benchmarks:[]});assert.equal(v.horizon.daysRemaining,null);assert.equal(v.horizon.state,"unknown");assert.equal(v.planningWeeks,null);
 assert.equal(view({target:{...run(),targetDate:"2026-10-01"}}).horizon.state,"past");
 assert.equal(view({target:{...run(),targetDate:"2026-10-02"}}).horizon.state,"today");
 assert.equal(view({target:null}).benchmark,null);
 const v2=view({target:{...run(),value:300}});assert.equal(v2.benchmark?.status,"at_or_beyond_target");assert.equal(v2.benchmark?.remainingGap,0);
});
test("manual observations require confirmed context, actual local dates and valid dimensions",()=>{
 const body={value:"5.5",unit:"min/km",observedAt:"2026-10-02",contextConfirmed:true};const parsed=parseProgressReport(body,run(),now);assert.equal(parsed.value,5.5);assert.equal(parsed.unit,"min/km");
 for(const patch of [{contextConfirmed:false},{observedAt:"2026-02-30"},{observedAt:"2026-10-03"},{value:true},{value:[5]},{value:0},{unit:"W"},{unit:"sec/km",value:59},{supersedesId:"prior",note:""}]) assert.throws(()=>parseProgressReport({...body,...patch},run(),now));
 assert.throws(()=>parseProgressReport(body,{...run(),context:undefined},now));
 const localNow=new Date("2026-10-03T01:00:00Z");assert.doesNotThrow(()=>parseProgressReport(body,run(),localNow,"America/New_York"));
 assert.throws(()=>parseProgressReport({...body,observedAt:"2026-10-03"},run(),localNow,"America/New_York"));
});
test("target context parser rejects incompatible sport/metric combinations",()=>{
 for (const patch of [{context:"ftp"},{context:"swim_threshold"},{context:"custom"},{context:"custom",contextDescription:"x".repeat(501)},{context:["run5k"]},{metric:"fitness"}]) assert.throws(()=>parsePlanningTarget({...run(),...patch},now));
});
test("content revision changes for same-length target, result, provenance and context updates",()=>{
 const baseline=view({reports:[report()]});const revision=targetProgressRevision(baseline);
 for (const changed of [view({target:{...run(),value:280},reports:[report()]}),view({reports:[report({value:4.9})]}),view({reports:[report({source:"coach_entered"})]}),view({benchmarks:[bench({result:1550})],reports:[report()]})]) assert.notEqual(targetProgressRevision(changed),revision);
 assert.equal(targetProgressRevision(baseline),revision);
});
const profile={goal:"run-only",experience:"beginner",weeklyHours:3,birthYear:1990};
const setup=()=>parsePlanningSetup({adultConfirmed:true,profileConfirmed:true,goalDescription:"Run comfortably",baselineWeeklyMinutes:120,baselineObservedAt:"2026-10-01",interruptions:"none",restrictions:"none",qualifiedReview:"none_needed",trainingDays:[1,3,6],maxSessionMinutes:45,equipmentAccess:"Shoes and outdoor path",planWeeks:4,targetGoal:run()},now);
test("explicit baseline-only opt-in permits separate aspiration without target-driven prescription",()=>{
 assert.equal(assessPlanningSetup(profile,setup(),now).ready,false);
 for(const baselinePlanOptIn of ["true",1,{},[]]) assert.equal(assessPlanningSetup(profile,parsePlanningSetup({...setup(),baselinePlanOptIn},now),now).ready,false);
 const opted={...setup(),baselinePlanOptIn:true};const readiness=assessPlanningSetup(profile,opted,now);assert.equal(readiness.ready,true);assert.equal(readiness.planningBasis,"baseline_only");assert.ok(readiness.targetReview?.length);assert.equal(opted.baselineWeeklyMinutes,120);assert.equal(opted.targetGoal?.value,270);
});
test("baseline-only aspiration never bypasses contraindication, stale baseline, minor or interruption gates",()=>{
 const opted={...setup(),baselinePlanOptIn:true};
 for(const patch of [{restrictions:"present" as const},{restrictions:"unknown" as const},{interruptions:"yes" as const},{qualifiedReview:"required" as const},{baselineWeeklyMinutes:null},{baselineObservedAt:"2026-08-01"},{adultConfirmed:false},{confirmedAt:"2026-09-01T12:00:00Z"}]) assert.equal(assessPlanningSetup(profile,{...opted,...patch},now).ready,false);
 assert.equal(assessPlanningSetup({...profile,injured:true},opted,now).ready,false);assert.equal(assessPlanningSetup({...profile,birthYear:2015},opted,now).ready,false);
});
