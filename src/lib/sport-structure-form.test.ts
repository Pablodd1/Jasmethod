import test from "node:test";
import assert from "node:assert/strict";
import { emptyFriendlyStep, emptyFriendlyStructure, friendlyStructureFrom, friendlyStructureValue } from "./sport-structure-form";
import { SPORT_STRUCTURE_EXAMPLES } from "./sport-structure-examples";
import { normalizeSportStructure } from "./sport-structure";
import { validateStructurePrescription } from "./sport-structure-edit";

test("new friendly drafts never infer a dose, stroke, station load or athlete capacity", () => {
  for (const sport of ["swim", "strength", "hyrox"]) {
    const form = emptyFriendlyStructure(sport)!;
    assert.equal(form.steps.length, 0); assert.equal(form.poolLength, "");
    assert.throws(() => friendlyStructureValue(form, sport));
  }
  const row = emptyFriendlyStep("station");
  for (const field of ["name", "zone", "amount", "estimate", "load", "stroke", "endpoint"]) assert.equal(row[field as keyof typeof row], "");
  assert.equal(emptyFriendlyStructure("brick"), null);
});

test("pool, strength and HYROX examples round-trip without changing endpoints, notes, loads or rest", () => {
  for (const sport of ["swim", "strength", "hyrox"]) {
    const original = SPORT_STRUCTURE_EXAMPLES[sport].structure;
    const form = friendlyStructureFrom(original, sport)!; assert.ok(form);
    const normalized = friendlyStructureValue(form, sport);
    assert.deepEqual(normalized, normalizeSportStructure(original, sport));
    validateStructurePrescription({ durationMin: 30, sportStructureBudgetMin: 30, sportStructure: normalized }, {
      athleteId: "fixture-athlete", workoutId: "fixture-workout", sport, title: "Reviewed example", dateLocal: "2026-10-15", timezone: "UTC",
    });
  }
});

test("unsupported shapes or metadata stay in advanced JSON rather than losing instructions", () => {
  const pool: any = structuredClone(SPORT_STRUCTURE_EXAMPLES.swim.structure);
  pool.steps[0].sendOffSeconds = 150;
  assert.equal(friendlyStructureFrom(pool, "swim"), null);
  assert.equal(friendlyStructureFrom(SPORT_STRUCTURE_EXAMPLES.brick.structure, "brick"), null);
  const strength: any = structuredClone(SPORT_STRUCTURE_EXAMPLES.strength.structure);
  strength.steps[0].endpoint = { type: "lap" };
  assert.equal(friendlyStructureFrom(strength, "strength"), null);
  const hyrox: any = structuredClone(SPORT_STRUCTURE_EXAMPLES.hyrox.structure);
  hyrox.steps[1].endpoint = { type: "time", seconds: 360 };
  assert.equal(friendlyStructureFrom(hyrox, "hyrox"), null);
});

test("athlete-entered pool lengths/stroke/rest and exact yards survive canonical normalization", () => {
  const form = emptyFriendlyStructure("swim")!;
  form.poolLength = "25"; form.poolUnit = "yd";
  form.steps = [{ ...emptyFriendlyStep("lengths"), name: "Easy backstroke", zone: "z1", phase: "warmup", stroke: "backstroke", amount: "4", estimate: "150" },
    { ...emptyFriendlyStep("rest"), amount: "30", note: "Full recovery" }];
  const result: any = friendlyStructureValue(form, "swim");
  assert.deepEqual(result.poolLength, { value: 25, unit: "yd" });
  assert.equal(result.steps[0].lengths, 4); assert.equal(result.steps[0].stroke, "backstroke");
  assert.equal(result.steps[1].seconds, 30);
  form.steps[0].amount = "4.5"; assert.throws(() => friendlyStructureValue(form, "swim"), /lengths/);
  form.steps[0].amount = "4"; form.steps[0].stroke = ""; assert.throws(() => friendlyStructureValue(form, "swim"), /stroke/);
});

test("valid saved structures without optional estimates remain editable as exact JSON without inventing time",()=>{
  for(const sport of ['swim','strength','hyrox']){
    const value:any=structuredClone(SPORT_STRUCTURE_EXAMPLES[sport].structure);
    const row=value.steps.find((s:any)=>s.kind==='lengths'||(s.endpoint&&s.endpoint.type!=='time'&&s.estimatedSeconds!==undefined));
    assert.ok(row);delete row.estimatedSeconds;
    const normalized=normalizeSportStructure(value,sport);assert.equal(friendlyStructureFrom(normalized,sport),null);
    assert.deepEqual(normalizeSportStructure(JSON.parse(JSON.stringify(normalized)),sport),normalized);
  }
});

test("strength repeated sets are numbered in order; absent optional load never becomes a prescription", () => {
  const form = emptyFriendlyStructure("strength")!;
  const set = { ...emptyFriendlyStep("set"), name: "Reviewed squat", zone: "z2", endpoint: "reps", amount: "5", estimate: "30" };
  form.steps = [set, { ...emptyFriendlyStep("rest"), amount: "60" }, { ...set, load: "10", loadUnit: "kg" }];
  const result: any = friendlyStructureValue(form, "strength");
  assert.equal(result.steps[0].setNumber, 1); assert.equal(result.steps[2].setNumber, 2);
  assert.equal(result.steps[0].load, undefined); assert.deepEqual(result.steps[2].load, { value: 10, unit: "kg" });
  form.steps[2].load = "0"; assert.equal((friendlyStructureValue(form, "strength") as any).steps[2].load.value, 0);
});

test("HYROX only accepts explicit valid run/station doses and rejects invalid or missing values", () => {
  const form = friendlyStructureFrom(SPORT_STRUCTURE_EXAMPLES.hyrox.structure, "hyrox")!;
  const station = form.steps.find(row => row.kind === "station")!;
  station.amount = "20"; station.load = "6"; station.note = "Practiced dose confirmed by athlete";
  const result: any = friendlyStructureValue(form, "hyrox");
  assert.equal(result.steps[2].endpoint.reps, 20); assert.equal(result.steps[2].load.value, 6);
  for (const bad of ["", "NaN", "Infinity", "-1"]) { station.estimate = bad; assert.throws(() => friendlyStructureValue(form, "hyrox")); }
  station.estimate = "60"; station.amount = "2.5"; assert.throws(() => friendlyStructureValue(form, "hyrox"), /repetitions/);
  station.amount = "20"; station.load = "-1"; assert.throws(() => friendlyStructureValue(form, "hyrox"), /load/);
});
