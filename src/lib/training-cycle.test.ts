import { test } from "node:test";
import assert from "node:assert/strict";
import { cycleActivityEvidence, savedCycleSummary, shapeTrainingCycle } from "./training-cycle";
import { boundPlanWeeks } from "./planning-bounds";
import { parsePlanningSetup } from "./planning-setup";
import { prescribeToday } from "./adaptive";
import { effectiveSessionFromRecords } from "./effective-prescription";
import { addDaysKey, localDate } from "./dates";
import {canonicalSession} from './canonical-session';
import {buildCycleBaselineReviews} from './cycle-review';
const setup = parsePlanningSetup({ trainingDays: [0,1,2,3,4,5,6], maxSessionMinutes:90, baselineWeeklyMinutes:300 });
const raw = Array.from({length:24}, (_,index) => ({week:index+1,theme:"Build",sessions:Array.from({length:7},()=>({sport:"run" as const,title:"Threshold practice",minutes:60,zone:"z4" as const,type:"threshold",description:"Template"})),totalMinutes:420}));
const bounded = boundPlanWeeks(raw, setup, 6, 1, "beginner").weeks;
const options = {startKey:"2026-10-12",raceKey:null,needsAssessment:true,recoveryReview:false,protectedDays:[] as string[]};

test("unknown history does not pretend difficult execution or add a second recovery reduction", () => {
  const reported=shapeTrainingCycle(bounded,{...options,recoveryReview:true});
  const unknown=shapeTrainingCycle(bounded,{...options,recoveryReview:true,recoveryReviewBasis:"unknown_history"});
  assert.ok(unknown[0].totalMinutes>reported[0].totalMinutes);
  assert.equal(unknown[0].totalMinutes,shapeTrainingCycle(bounded,options)[0].totalMinutes);
  assert.match(unknown[0].volumeDecision.reason,/load and recovery are unknown/);
  assert.doesNotMatch(unknown[0].volumeDecision.reason,/reported difficult\/incomplete/);
  assert.match(reported[0].volumeDecision.reason,/reported difficult\/incomplete/);
});

test("an event reduces only dates within its existing window, not the entire adjacent week",()=>{
  const week={week:1,theme:'Reviewed practice',templateVersion:'coaching-structure-v1',periodizationFactor:1,sessions:Array.from({length:7},(_,daySlot)=>({sport:'bike' as const,title:'Easy bike',minutes:40,zone:'z2' as const,type:'endurance',description:'Familiar easy bike',daySlot})),totalMinutes:280,restDaySlots:[],doubleDayNote:''};
  const plain=shapeTrainingCycle([week],{...options,templatePeriodized:true,needsAssessment:false});
  const shaped=shapeTrainingCycle([week],{...options,templatePeriodized:true,needsAssessment:false,events:[{id:'race-next-month',dateKey:'2026-11-01',priority:'A',distance:'5k'}]});
  for(const session of shaped[0].sessions){
    const before=plain[0].sessions.find(row=>row.daySlot===session.daySlot)!;
    assert.equal(session.minutes,session.daySlot===6?26:before.minutes);
    assert.equal(session.planningAdjustment.eventPhase,session.daySlot===6?'preparation':'ordinary');
  }
  assert.equal(shaped[0].totalMinutes,266);
  assert.equal(shaped[0].volumeDecision.application,'session_day');
  assert.equal(shaped[0].volumeDecision.dayFactors.filter(day=>day.factor<1).length,1);
});

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
  const evidence=cycleActivityEvidence([{id:"reported",source:"manual",date:localDate(options.startKey,"UTC"),completed:true,actualDurationMin:null,rpe:9,feedbackStatus:"completed"}],options.startKey,"UTC");
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

test("all A/B/C event days are protected and recent-event recovery is reduction-only", () => {
  const events = [
    { id: "recent", dateKey: "2026-10-04", priority: "A" as const, distance: "marathon" },
    { id: "a", dateKey: "2026-11-16", priority: "A" as const },
    { id: "b", dateKey: "2026-11-20", priority: "B" as const },
    { id: "c", dateKey: "2026-11-23", priority: "C" as const },
  ];
  const cycle = shapeTrainingCycle(bounded, { ...options, events });
  assert.match(cycle[0].theme, /Post-event/);
  assert.ok(cycle[0].totalMinutes < shapeTrainingCycle(bounded, options)[0].totalMinutes);
  for (const [index, week] of cycle.entries()) {
    assert.ok(week.totalMinutes <= bounded[index].totalMinutes);
    for (const session of week.sessions) assert.ok(!events.some(event => event.dateKey === addDaysKey(options.startKey, index * 7 + session.daySlot)));
  }
  assert.deepEqual(cycle.flatMap(week => week.eventDays), events.slice(1).map(event => event.dateKey));
});

test("comfortable review observations recur per sport within existing sessions without renewing evidence", async () => {
  const { buildCycleBaselineReviews } = await import("./cycle-review");
  const sports = ["run", "bike", "swim", "strength", "hyrox", "mobility", "boxing"] as const;
  const weeks = Array.from({ length: 24 }, (_, index) => ({ week: index + 1, theme: "Build", totalMinutes: 280,
    sessions: sports.map((sport, daySlot) => ({ sport, daySlot, minutes: 40, zone: "z4" as const, type: sport === "run" ? "speed" : "endurance", title: `${sport} template`, description: "Template" })), restDaySlots: [], doubleDayNote: "None" }));
  const baselineReviews = buildCycleBaselineReviews({ profile: {}, tests: [], appliedIds: [], sports, now: new Date("2026-10-12T12:00Z") });
  const before = JSON.stringify({ weeks, baselineReviews });
  const cycle = shapeTrainingCycle(weeks, { ...options, baselineReviews });
  assert.equal(JSON.stringify({ weeks, baselineReviews }), before);
  for (const sport of sports) {
    const observations = cycle.flatMap(week => week.observations).filter(observation => observation.sport === sport);
    assert.equal(observations.length, 6);
    assert.equal(observations[0].status, "missing");
    for (const [index, observation] of observations.entries()) {
      if (index) assert.equal(observation.dateKey, addDaysKey(observations[index - 1].dateKey, 28));
      assert.ok(observation.minutes <= 40);
    }
  }
  for (const [index, week] of cycle.entries()) {
    assert.equal(week.sessions.length, weeks[index].sessions.length);
    assert.ok(week.totalMinutes <= weeks[index].totalMinutes);
    for (const session of week.sessions.filter(session => /observation/.test(session.title))) {
      assert.equal(session.zone, "z2"); assert.match(session.description, /does not renew/);
    }
  }
});

test("valid cycling evidence is not downgraded for missing swimming evidence, but expiry reduces later sessions", async () => {
  const { buildCycleBaselineReviews } = await import("./cycle-review");
  const baselineReviews = buildCycleBaselineReviews({ profile: { ftp: 200 }, tests: [{ id: "ftp", date: new Date("2026-10-10T12:00Z"), type: "ftp", result: 200, completed: true, skipped: false }], appliedIds: ["ftp"], sports: ["bike", "swim"], now: new Date("2026-10-12T12:00Z") });
  const weeks = Array.from({ length: 24 }, (_, index) => ({ week: index + 1, theme: "Build", totalMinutes: 80, sessions: [
    { sport: "bike" as const, daySlot: 0, minutes: 40, zone: "z4" as const, type: "threshold", title: "Bike", description: "Template" },
    { sport: "swim" as const, daySlot: 2, minutes: 40, zone: "z4" as const, type: "threshold", title: "Swim", description: "Template" },
  ], restDaySlots: [1, 3, 4, 5, 6], doubleDayNote: "None" }));
  const cycle = shapeTrainingCycle(weeks, { ...options, baselineReviews });
  assert.equal(cycle[0].sessions[0].zone, "z4");
  assert.equal(cycle[0].sessions[1].zone, "z2");
  assert.ok(cycle.slice(13).every(week => week.sessions.filter(session => session.sport === "bike").every(session => session.zone === "z2")));
  assert.ok(cycle.flatMap(week => week.observations).filter(observation => observation.sport === "bike").length > 1);
  assert.equal(baselineReviews[0].observedAt, "2026-10-10");
});

test("event days defer affected optional pairs while ordinary days retain their reviewed schedule", () => {
  const pairWeek = { week: 1, theme: "Build", totalMinutes: 80, sessions: [
    { sport: "run" as const, daySlot: 0, minutes: 40, zone: "z2" as const, type: "endurance", title: "Run", description: "Template", doubleDayRole: "primary" as const, startTime: "07:00" },
    { sport: "bike" as const, daySlot: 0, movedFromSlot: 2, minutes: 40, zone: "z2" as const, type: "endurance", title: "Bike", description: "Template", doubleDayRole: "secondary" as const, startTime: "18:00" },
  ], restDaySlots: [1, 2, 3, 4, 5, 6], doubleDayNote: "Optional pair" };
  const cycle = shapeTrainingCycle([pairWeek], { ...options, events: [{ dateKey: "2026-10-16", priority: "C" }] });
  assert.equal(cycle[0].sessions.length, 2); assert.equal(cycle[0].sessions[0].doubleDayRole, "primary");
  assert.equal(cycle[0].observations.length, 0); assert.equal(cycle[0].sessions[0].daySlot, 0);
  assert.deepEqual(cycle[0].restDaySlots, pairWeek.restDaySlots);
  assert.equal(cycle[0].doubleDayNote, "Optional pair");
  const affected=shapeTrainingCycle([{...pairWeek,sessions:pairWeek.sessions.map(row=>({...row,daySlot:1}))}],{...options,events:[{dateKey:"2026-10-16",priority:"C"}]});
  assert.equal(affected[0].sessions.length,2);assert.equal(affected[0].sessions[0].doubleDayRole,"primary");
  const eventDay=shapeTrainingCycle([{...pairWeek,sessions:pairWeek.sessions.map(row=>({...row,daySlot:4}))}],{...options,events:[{dateKey:"2026-10-16",priority:"C"}]});
  assert.equal(eventDay[0].sessions.length,0);
  assert.equal(shapeTrainingCycle(bounded, { ...options, recoveryReview: true })[0].observations.length, 0);
});

test("template maximal-speed and test labels become controlled practice even with valid endurance anchors", async () => {
  const { buildCycleBaselineReviews } = await import("./cycle-review");
  const baselineReviews = buildCycleBaselineReviews({ profile: { runPaceBase: 318 }, tests: [{ id: "run", date: new Date("2026-10-10T12:00Z"), type: "run5k", result: 1500, completed: true, skipped: false }], appliedIds: ["run"], sports: ["run"], now: new Date("2026-10-12T12:00Z") });
  const week = { week: 1, theme: "Build", totalMinutes: 80, sessions: ["speed", "test"].map((type, daySlot) => ({ sport: "run" as const, type, daySlot, minutes: 40, zone: "z7" as const, title: "Maximal trial", description: "All-out effort" })), restDaySlots: [2, 3, 4, 5, 6], doubleDayNote: "None" };
  const cycle = shapeTrainingCycle([week], { ...options, needsAssessment: false, baselineReviews });
  for (const session of cycle[0].sessions) { assert.equal(session.zone, "z2"); assert.equal(session.type, "endurance"); assert.doesNotMatch(session.title, /Maximal/); assert.doesNotMatch(session.description, /All-out/); }
});

test("saved calendar-only cycle dates remain calendar days in western timezones", () => {
  const summary = savedCycleSummary({ id: "date-only", name: "Calendar", startDate: "2026-11-01", raceDate: "2026-11-15", weeks: 4 }, "America/New_York", "2026-11-01");
  assert.equal(summary.start, "2026-11-01"); assert.equal(summary.raceDate, "2026-11-15");
  assert.equal(summary.currentWeek, 1); assert.equal(summary.end, "2026-11-28");
});

test("an unperformed planned match never hides a completed imported session", () => {
  const date = localDate(options.startKey, "UTC");
  const rows = [
    { id: "plan", source:"plan", date, completed: false, actualDurationMin: null, feedbackStatus: "unknown", rpe: null },
    { id: "import", source:"garmin", matchedPlanId: "plan", date, completed: true, actualDurationMin: 45, feedbackStatus: "completed", rpe: 9 },
  ];
  const evidence = cycleActivityEvidence(rows, options.startKey, "UTC");
  assert.equal(evidence.reportedSessions, 1); assert.equal(evidence.reportedMinutes, 45);
  assert.equal(evidence.unknownDurationSessions, 0); assert.deepEqual(evidence.protectedDays, [options.startKey]);
  assert.equal(evidence.recoveryReview, true);
  assert.ok(!shapeTrainingCycle(bounded, { ...options, protectedDays: evidence.protectedDays })[0].sessions.some(session => session.daySlot === 0));
  assert.deepEqual(cycleActivityEvidence([...rows].reverse(), options.startKey, "UTC"), evidence);
});

test("reviewed sport purpose survives cycle shaping only while it agrees with the final intensity", async () => {
  const { buildCycleBaselineReviews } = await import("./cycle-review");
  const { generatePlan } = await import("./science");
  const baselineReviews = buildCycleBaselineReviews({ profile: { ftp: 200 }, tests: [{ id: "ftp", date: new Date("2026-10-10T12:00Z"), type: "ftp", result: 200, completed: true, skipped: false }], appliedIds: ["ftp"], sports: ["bike", "swim", "run"], now: new Date("2026-10-12T12:00Z") });
  const raw = generatePlan({ level: "advanced", distance: "olympic", weeks: 4, startDate: new Date("2026-10-12T12:00Z"), weeklyHours: 5, reviewedCycle: true });
  const source = boundPlanWeeks(raw, setup, 5, 1, "advanced", [], { preserveWeeklyDose: true }).weeks;
  const cycle = shapeTrainingCycle(source, { ...options, needsAssessment: false, baselineReviews, templatePeriodized: true });
  const bike = cycle[2].sessions.find(s => s.sport === "bike" && s.zone === "z4")!;
  assert.ok(bike, "A current cycling anchor retains the supported threshold purpose.");
  assert.match(bike.description, /Purpose: Develop controlled sport-specific work/);
  assert.equal(bike.coaching?.recipe, 'threshold');
  assert.equal(bike.coaching?.demanding, true);
  const reduced = shapeTrainingCycle(source, { ...options, needsAssessment: true, templatePeriodized: true });
  const easy = reduced[2].sessions.find(s => s.daySlot === bike.daySlot)!;
  assert.ok(Number(easy.zone.slice(1)) <= 3);
  assert.doesNotMatch(easy.description, /controlled threshold intervals/);
  assert.doesNotMatch(easy.title, /threshold intervals/);
  assert.equal(easy.coaching?.demanding, false);
  assert.ok(reduced[0].sessions.filter(s => /observation/.test(s.title)).every(s => /does not measure/.test(s.description)));
});

test('comfortable reviewed observations retain easy and technique identity and actual canonical steps without inventing references',()=>{
  for(const sport of ['swim','bike','run'] as const)for(const recipe of ['aerobic','technique'] as const){
    const session={sport,daySlot:0,minutes:45,zone:'z2' as const,type:'endurance',title:`${sport} · deliberate ${recipe} practice`,description:'Purpose: retain familiar controlled practice and complete recoveries.',coaching:{recipe,phase:'foundation' as const,purpose:`Familiar ${sport} ${recipe} practice`,minimumMinutes:20,demanding:false,note:'Original reviewed equipment and technique guidance.'}};
    const weeks=[{week:1,theme:'Reviewed foundation',templateVersion:'coaching-structure-v1',totalMinutes:45,sessions:[session],restDaySlots:[1,2,3,4,5,6],doubleDayNote:'None'}];
    const missing=buildCycleBaselineReviews({profile:{},tests:[],appliedIds:[],sports:[sport],now:new Date('2026-10-12T12:00Z')});
    const current=buildCycleBaselineReviews({profile:{ftp:200,runPaceBase:318,swimPaceBase:100},tests:[{id:'bike',type:'ftp',result:200,date:new Date('2026-10-10T12:00Z'),completed:true,skipped:false},{id:'run',type:'run5k',result:1500,date:new Date('2026-10-10T12:00Z'),completed:true,skipped:false},{id:'swim',type:'swim',result:100,date:new Date('2026-10-10T12:00Z'),completed:true,skipped:false}],appliedIds:['bike','run','swim'],sports:[sport],now:new Date('2026-10-12T12:00Z')});
    const before=JSON.stringify({weeks,missing,current});
    const observed=shapeTrainingCycle(weeks,{...options,baselineReviews:missing,templatePeriodized:true})[0];
    const ordinary=shapeTrainingCycle(weeks,{...options,needsAssessment:false,baselineReviews:current,templatePeriodized:true})[0];
    assert.equal(observed.sessions[0].title,session.title);
    assert.equal(observed.sessions[0].coaching?.purpose,session.coaching.purpose);
    assert.equal(observed.sessions[0].coaching?.note,session.coaching.note);
    assert.match(observed.sessions[0].description,/observation within this planned session on 2026-10-12/);
    assert.equal(observed.observations.length,1);assert.equal(ordinary.observations.length,0);
    assert.equal(observed.observations[0].dateKey,'2026-10-12');assert.equal(observed.observations[0].status,'missing');
    assert.equal(missing[0].source,'unavailable');assert.equal(missing[0].observedAt,null);
    const canonical=(s:typeof session)=>{
      const workout={id:'synthetic-comfortable-review',sport:s.sport,title:s.title,type:s.type,intensity:s.zone,durationMin:s.minutes};
      const prescription=prescribeToday({session:{...workout,description:s.description,coaching:s.coaching,cycleVersion:'bounded-cycle-v1'},adaptation:{verdict:'planned',durationFactor:1,intensityCap:s.zone}});
      return canonicalSession({athleteId:'synthetic',workout,prescription,profile:{},dateLocal:'2026-10-12',timezone:'UTC'});
    };
    const observedCanonical=canonical(observed.sessions[0] as typeof session),ordinaryCanonical=canonical(ordinary.sessions[0] as typeof session);
    assert.deepEqual(observedCanonical.steps,ordinaryCanonical.steps);
    assert.ok(observedCanonical.steps.every(step=>step.target.type==='open'));
    assert.equal(observedCanonical.steps.reduce((n,step)=>n+step.seconds,0),45*60);
    assert.equal(observed.totalMinutes,45);assert.equal(observed.sessions[0].zone,'z2');
    assert.equal(JSON.stringify({weeks,missing,current}),before,'Planning cannot create or renew a measured reference.');
  }
});

test('review annotation does not retain quality identity across missing, expired or recovery caps',()=>{
  const source={sport:'bike' as const,daySlot:0,minutes:45,zone:'z4' as const,type:'interval',title:'Bike · threshold work',description:'Original threshold purpose',coaching:{recipe:'threshold' as const,phase:'development' as const,purpose:'Reviewed threshold work',minimumMinutes:25,demanding:true}};
  const weeks=[{week:1,theme:'Reviewed development',templateVersion:'coaching-structure-v1',totalMinutes:45,sessions:[source],restDaySlots:[1,2,3,4,5,6],doubleDayNote:'None'}];
  const missing=buildCycleBaselineReviews({profile:{},tests:[],appliedIds:[],sports:['bike'],now:new Date('2026-10-12T12:00Z')});
  const expired=buildCycleBaselineReviews({profile:{ftp:200},tests:[{id:'old',type:'ftp',result:200,date:new Date('2026-01-01T12:00Z'),completed:true,skipped:false}],appliedIds:['old'],sports:['bike'],now:new Date('2026-10-12T12:00Z')});
  for(const baselineReviews of [missing,expired])for(const recoveryReview of [false,true]){
    const result=shapeTrainingCycle(weeks,{...options,baselineReviews,recoveryReview,templatePeriodized:true})[0];
    const session=result.sessions[0];assert.equal(session.zone,'z2');assert.equal(session.coaching?.demanding,false);
    assert.notEqual(session.title,source.title);assert.notEqual(session.coaching?.purpose,source.coaching.purpose);
    assert.ok(session.minutes<=45);if(recoveryReview)assert.equal(session.minutes,27);
    const p=prescribeToday({session:{sport:session.sport,title:session.title,type:session.type,intensity:session.zone,durationMin:session.minutes,description:session.description,coaching:session.coaching,cycleVersion:'bounded-cycle-v1'},adaptation:{verdict:'planned',durationFactor:1,intensityCap:session.zone}});
    assert.ok(p.steps.every(step=>Number(step.zone.slice(1))<=2));
    assert.ok(!p.steps.some(step=>/controlled work/.test(step.name)));
  }
});

test("matched partial and completed reports merge known duration without duplicate sessions and retain all actual dates", () => {
  const previous = addDaysKey(options.startKey, -1);
  const rows = [
    { id: "plan", source:"plan", date: localDate(previous, "UTC"), completed: false, actualDurationMin: null, feedbackStatus: "partial", rpe: 9 },
    { id: "import", source:"garmin", matchedPlanId: "plan", date: localDate(options.startKey, "UTC"), completed: true, actualDurationMin: 45, feedbackStatus: "completed", rpe: 3 },
    { id: "duplicate", source:"whoop", matchedPlanId: "plan", date: localDate(options.startKey, "UTC"), completed: true, actualDurationMin: 40, feedbackStatus: "completed", rpe: 4 },
  ];
  const evidence = cycleActivityEvidence(rows, options.startKey, "UTC");
  assert.equal(evidence.reportedSessions, 1); assert.equal(evidence.reportedMinutes, 45);
  assert.equal(evidence.unknownDurationSessions, 0); assert.equal(evidence.recoveryReview, true);
  assert.deepEqual(evidence.protectedDays, [previous, options.startKey]);
  const unknown = cycleActivityEvidence(rows.map(row => ({ ...row, actualDurationMin: null })), options.startKey, "UTC");
  assert.equal(unknown.reportedSessions, 1); assert.equal(unknown.reportedMinutes, null); assert.equal(unknown.unknownDurationSessions, 1);
});

test("matching chains and missing planned rows still count one actual session and keep unrelated work separate", () => {
  const date = localDate(options.startKey, "UTC");
  const rows = [
    { id: "a", source:"manual", matchedPlanId: "missing-plan", date, completed: true, actualDurationMin: 30, feedbackStatus: "completed", rpe: 3 },
    { id: "b", source:"manual", matchedPlanId: "a", date, completed: true, actualDurationMin: 30, feedbackStatus: "completed", rpe: 3 },
    { id: "c", source:"manual", date, completed: false, actualDurationMin: null, feedbackStatus: "substituted", rpe: 8 },
  ];
  const evidence = cycleActivityEvidence(rows, options.startKey, "UTC");
  assert.equal(evidence.reportedSessions, 2); assert.equal(evidence.reportedMinutes, 30);
  assert.equal(evidence.unknownDurationSessions, 1); assert.equal(evidence.recoveryReview, true);
  assert.deepEqual(cycleActivityEvidence([...rows].reverse(), options.startKey, "UTC"), evidence);
});
