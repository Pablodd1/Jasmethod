import test from "node:test";
import assert from "node:assert/strict";
import { stepGuide, sessionEnergy, actualSessionKj, compareSessions, kcalToKj } from "./workout-energy";
import { buildAthleteModel } from "./athlete-model";

const full = { ftp: 250, lthr: 165, runPaceBase: 270, swimPaceBase: 100, weightKg: 70 };

test("every step shows every unit the athlete may use; absolute numbers only with a reference", () => {
  const bike = stepGuide({ seconds: 600, zone: "z4" }, "bike", full);
  assert.match(bike.text, /RPE 7/); assert.match(bike.text, /226–263 W/); assert.match(bike.text, /90–105% FTP/); assert.match(bike.text, /bpm/); assert.match(bike.text, /kJ/);
  const rest = stepGuide({ seconds: 180, zone: "z1", phase: "recovery" }, "bike", full);
  assert.match(rest.text, /RPE 2/); assert.match(rest.text, /≤138 W/); assert.match(rest.text, /≤132 bpm/);
  const run = stepGuide({ seconds: 600, zone: "z4" }, "run", full);
  assert.match(run.text, /\/km/); assert.match(run.text, /run CP/); assert.match(run.text, /bpm/);
  const swim = stepGuide({ seconds: 115, zone: "z4" }, "swim", full);
  assert.match(swim.text, /\/100 m/); assert.match(swim.text, /CSS/); assert.match(swim.text, /~10 bpm lower/);
  const hyrox = stepGuide({ seconds: 240, zone: "z4" }, "hyrox", {});
  assert.match(hyrox.text, /Z4 · RPE 7/); assert.match(hyrox.text, /% LTHR/); assert.doesNotMatch(hyrox.text, /\d+ bpm/, "no invented absolute HR");
  assert.match(stepGuide({ seconds: 60, zone: "z5" }, "bike", {}, true).text, /muy duro|duro/);
});

test("mechanical bike work and estimated metabolic energy remain distinct; unknown when neither", () => {
  const steps = [{ seconds: 900, zone: "z2" }, { seconds: 1200, zone: "z4" }, { seconds: 600, zone: "z1" }];
  const b = sessionEnergy(steps, "bike", full, 60);
  assert.equal(b.method, "power"); assert.ok(b.workKj! > 400 && b.workKj! < 600, String(b.workKj)); assert.equal(b.kcal, b.workKj);
  assert.ok(b.highIntensityPct! > 50); assert.ok(b.carbsBurnedG! > 60); assert.equal(b.carbsIntakeTargetG, 45);
  const r = sessionEnergy(steps, "run", { weightKg: 70 }, 20);
  assert.equal(r.method, "met-estimate"); assert.equal(r.workKj,null); assert.equal(r.kjPerHour,null); assert.equal(r.highIntensityKj,null); assert.equal(r.metabolicKj,kcalToKj(r.kcal!));
  const u = sessionEnergy(steps, "run", {}, 20);
  assert.equal(u.method, "unavailable"); assert.equal(u.workKj, null); assert.match(u.hydrationNote, /Weigh yourself before and after/);
  assert.match(sessionEnergy(steps, "bike", { ...full, sweatRateMlH: 900 }, 60).hydrationNote, /900 ml\/h/);
});

test("big carbohydrate cost triggers recovery-carb guidance", () => {
  const long = sessionEnergy([{ seconds: 3 * 3600, zone: "z3" }], "bike", full, 60);
  assert.ok(long.carbsBurnedG! >= 200); assert.match(long.recoveryCarbNote!, /1\.0–1\.2 g\/kg\/h/);
});

test("actual mechanical work requires bike power; calories are only metabolic energy", () => {
  assert.deepEqual(actualSessionKj({ sport: "bike", avgPower: 200, actualDurationMin: 60 }, null), { kj: 720, metabolicKj:null, source: "power" });
  assert.deepEqual(actualSessionKj({ sport: "run", calories: 650, actualDurationMin: 50 }, null), { kj:null,metabolicKj:2719.6, source: "device-calories" });
  assert.equal(actualSessionKj({ sport: "run", actualDurationMin: 50 }, { weightKg: 70 }).source, "estimate");
  assert.equal(actualSessionKj({ sport: "run" }, null).kj, null);
  const c = compareSessions({ kj: 720, minutes: 60, highIntensityKj: 200 }, { kj: 900, minutes: 60, highIntensityKj: 350 })!;
  assert.equal(c.kjDeltaPct, 25); assert.equal(c.highIntensityDeltaKj, 150);
  assert.equal(compareSessions({kj:0,minutes:60},{kj:30,minutes:30}),null);
  assert.equal(compareSessions(actualSessionKj({sport:"run",calories:650},null) as any,{kj:720,minutes:60}),null);
});

test("MET steps display calories, never invented mechanical kJ, in both languages",()=>{
  assert.equal(kcalToKj(100),418.4);
  for(const es of [false,true]){
    const guide=stepGuide({seconds:600,zone:"z2"},"run",{weightKg:70},es);
    assert.equal(guide.kj,null);assert.ok(guide.kcal!>0);assert.match(guide.text,/kcal/);assert.doesNotMatch(guide.text,/\bkJ\b/);
  }
});

test("mixed power and calorie history cannot invent comparable mechanical workload totals",()=>{
 const now=new Date("2026-11-03T12:00:00Z");
 const history=Array.from({length:28},(_,i)=>({date:new Date(+now-(28-i)*86400000),sport:i%2?'run':'bike',durationMin:60,completed:true,planned:false,avgPower:i%2?undefined:180,calories:i%2?600:undefined,source:'manual'}));
 const model=buildAthleteModel({history,metrics:[],profile:{weightKg:70},now});
 assert.equal(model.kjLast7,null);assert.equal(model.kjWeeklyAvg28,null);assert.ok(model.notes.some(note=>/calories and metabolic estimates remain separate/.test(note)));
});

test("athlete model reports weekly kJ vs 4-week norm from imported history", () => {
  const NOW = new Date("2026-11-02T12:00:00Z");
  const hist = Array.from({ length: 30 }, (_, i) => ({ date: new Date(+NOW - (30 - i) * 86400000), sport: "bike", durationMin: 60, completed: true, planned: false, avgPower: 180, source: "garmin" }));
  const m = buildAthleteModel({ history: hist, metrics: [], profile: { weightKg: 70 }, now: NOW });
  assert.ok(m.kjLast7! > 0 && m.kjWeeklyAvg28! > 0); assert.equal(m.kjSources.power, m.sessions28);
});
