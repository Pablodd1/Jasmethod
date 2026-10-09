import { test } from "node:test";
import assert from "node:assert/strict";
import { cycleActivityEvidence, savedCycleSummary, shapeTrainingCycle } from "./training-cycle";
import { boundPlanWeeks } from "./planning-bounds";
import { parsePlanningSetup } from "./planning-setup";
import { prescribeToday } from "./adaptive";
import { effectiveSessionFromRecords } from "./effective-prescription";
import { addDaysKey, localDate } from "./dates";
const setup = parsePlanningSetup({ trainingDays: [0,1,2,3,4,5,6], maxSessionMinutes:90, baselineWeeklyMinutes:300 });
const raw = Array.from({length:24}, (_,index) => ({week:index+1,theme:"Build",sessions:Array.from({length:7},()=>({sport:"run" as const,title:"Threshold practice",minutes:60,zone:"z4" as const,type:"threshold",description:"Template"})),totalMinutes:420}));
const bounded = boundPlanWeeks(raw, setup, 6, 1, "beginner").weeks;
const options = {startKey:"2026-10-12",raceKey:null,needsAssessment:true,recoveryReview:false,protectedDays:[] as string[]};

test("saved 3/6-month cycles have gradual bounded weeks, scheduled recovery and no automatic capacity increase", () => {
  const before=JSON.stringify(bounded); const cycle=shapeTrainingCycle(bounded,options);
  assert.equal(cycle.length,24); assert.equal(JSON.stringify(bounded),before);
  for(const [index,week] of cycle.entries()) {
    assert.ok(week.totalMinutes<=bounded[index].totalMinutes);
    assert.ok(week.totalMinutes<=300); assert.ok(week.restDaySlots.length>=2);
    assert.equal(week.totalMinutes,week.sessions.reduce((sum,s)=>sum+s.minutes,0));
    for(const session of week.sessions) {
      const draft=prescribeToday({session:{...session,durationMin:session.minutes,intensity:session.zone},adaptation:{verdict:"planned",durationFactor:1,intensityCap:session.zone}});
      assert.equal(draft.steps.reduce((sum,s)=>sum+s.seconds,0),session.minutes*60);
      assert.ok(draft.steps.every(s=>!s.target && !s.targets?.power && !s.targets?.pace && !s.targets?.hr));
    }
  }
  assert.ok(cycle[0].totalMinutes<cycle[1].totalMinutes);
  assert.ok(cycle[1].totalMinutes<cycle[2].totalMinutes);
  assert.ok(cycle[3].totalMinutes<cycle[2].totalMinutes);
  assert.match(cycle[3].theme,/Recovery/);
});
test("missing benchmarks start with comfortable observation, never a maximal or fabricated test",()=>{
  const cycle=shapeTrainingCycle(bounded,options);
  const assessment=cycle[0].sessions.filter(session=>/baseline observation/.test(session.title));
  assert.equal(assessment.length,1);assert.equal(assessment[0].zone,"z2");
  assert.match(assessment[0].description,/does not measure VO2max, threshold, FTP/);
  assert.ok(cycle.slice(0,2).every(week=>week.sessions.every(s=>Number(s.zone.slice(1))<=2)));
  assert.ok(cycle.every(week=>week.sessions.every(s=>Number(s.zone.slice(1))<=3)));
});
test("performed dates and actual race dates are protected without shifting or making up work",()=>{
  const raceKey=addDaysKey(options.startKey,35);
  const cycle=shapeTrainingCycle(bounded,{...options,raceKey,protectedDays:[options.startKey]});
  assert.ok(!cycle[0].sessions.some(s=>s.daySlot===0));
  assert.ok(!cycle[5].sessions.some(s=>s.daySlot===0));
  assert.match(cycle[4].theme,/Event preparation/);
  assert.match(cycle[6].theme,/Post-event/);
  assert.ok(cycle[4].totalMinutes<shapeTrainingCycle(bounded,options)[4].totalMinutes);
});
test("unknown actual duration is retained and recent difficult work reduces the opening week",()=>{
  const evidence=cycleActivityEvidence([{id:"reported",date:localDate(options.startKey,"UTC"),completed:true,actualDurationMin:null,rpe:9,feedbackStatus:"completed"}],options.startKey,"UTC");
  assert.equal(evidence.reportedMinutes,null);assert.equal(evidence.unknownDurationSessions,1);assert.equal(evidence.recoveryReview,true);
  const cycle=shapeTrainingCycle(bounded,{...options,recoveryReview:evidence.recoveryReview});
  assert.ok(cycle[0].totalMinutes<shapeTrainingCycle(bounded,options)[0].totalMinutes);
  assert.match(cycle[0].theme,/Recovery/);
});
test("saved cycle uses athlete-local dates across DST and remains visible before and after its horizon",()=>{
  const plan={id:"fixture",name:"Fixture",startDate:localDate("2026-10-12","America/New_York"),weeks:12,raceDate:localDate("2026-12-06","America/New_York")};
  assert.deepEqual(savedCycleSummary(plan,"America/New_York","2026-11-09"),{id:"fixture",name:"Fixture",start:"2026-10-12",end:"2027-01-03",weeks:12,currentWeek:5,status:"active",raceDate:"2026-12-06"});
  assert.equal(savedCycleSummary(plan,"America/New_York","2026-10-11").status,"upcoming");
  assert.equal(savedCycleSummary(plan,"America/New_York","2027-01-04").status,"ended");
});
test("provisional structures require fresh check-in and never downgrade symptom holds or urgent warnings",()=>{
  const now=new Date("2026-10-12T12:00:00Z");
  const session={id:"fixture",userId:"athlete",sport:"run",title:"Saved workout",type:"endurance",intensity:"z2",durationMin:30,date:localDate("2026-10-12","UTC")};
  const prescription={...prescribeToday({session,adaptation:{verdict:"planned",durationFactor:1,intensityCap:"z2"}}),planningStatus:"provisional"};
  const base={userId:"athlete",timezone:"UTC",now,workout:{...session,prescription:JSON.stringify(prescription)},planning:{ready:true,missing:[],review:[],ruleId:"fixture"}};
  const answers={sleep:5,soreness:1,motivation:5,energy:5,stress:1,sick:false,newPain:false,urgentSymptoms:false,availableMin:60};
  const adaptation={verdict:"full",durationFactor:1,intensityCap:"z7"};
  const resolve=(patch:object)=>effectiveSessionFromRecords({...base,checkin:{date:session.date,answers:JSON.stringify({...answers,...patch}),adaptation:JSON.stringify(adaptation)}});
  assert.match(resolve({}).canonical.reason,/fresh session-day check-in/);
  assert.match(resolve({urgentSymptoms:true}).canonical.reason,/Stop exercise|emergency/);
  assert.match(resolve({newPain:true}).canonical.reason,/cannot diagnose|symptoms|pain/i);
  assert.equal(resolve({}).canonical.verdict,"blocked");
});

test("new cycle movement budgets preserve station identity without squeezing fixed sets into short sessions",()=>{
  for(const sport of ["strength","hyrox","mobility"]) for(const minutes of [1,5,10,20,45]) {
    const title="Station: Sled Push + Pull";
    const p=prescribeToday({session:{sport,title,type:"strength",intensity:"z2",durationMin:minutes,cycleVersion:"bounded-cycle-v1"},adaptation:{verdict:"full",durationFactor:1,intensityCap:"z2"},profile:{intensityPct:120}});
    assert.equal(p.durationMin,minutes);assert.equal(p.intensity,"z2");assert.equal(p.steps.reduce((sum,step)=>sum+step.seconds,0),minutes*60);
    assert.ok(p.steps.some(step=>step.name===title));assert.ok(p.steps.every(step=>step.reps===undefined));
    assert.doesNotMatch(p.detail.main,/4 sets|3 sets|4×5|3×10|Back Squat|Deadlift/);
    assert.match(p.steps.find(step=>step.phase==="active")!.note!,/No fixed load, repetitions/);
  }
});
test("strength and station mechanical demand is not hidden by a z1 label",()=>{
  const week={week:1,theme:"Build",sessions:[{sport:"strength" as const,title:"Strength",minutes:40,zone:"z1" as const,type:"strength",description:"Familiar work"},{sport:"run" as const,title:"Hard run",minutes:40,zone:"z4" as const,type:"interval",description:"Quality"}],totalMinutes:80};
  const result=boundPlanWeeks([week],setup,6,1,"pro").weeks[0];
  assert.equal(result.sessions.length,1);assert.equal(result.sessions[0].sport,"strength");
});
