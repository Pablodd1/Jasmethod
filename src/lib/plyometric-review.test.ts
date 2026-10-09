import test from "node:test";
import assert from "node:assert/strict";
import {generatePlan, generateBoxingCamp, generateTrackSprint, generateHyroxPlan, buildSessionDetail} from "./science";
import {structuredSteps} from "./prescription";
import {RESEARCH_SOURCES} from "./research";

const automaticPowerDose = /(?:depth jumps|box jumps|jump squats?|single-leg bounds|single-leg hops|power clean|trap bar jump|explosive push-ups|rotational throws)\s*\d|plyometrics.{0,30}(?:is mandatory|mandatory [12])/i;

test("generic plan slots retain optional power preparation without automatic explosive doses", () => {
  for (const level of ["beginner", "amateur", "advanced", "pro"]) {
    const weeks = generatePlan({level, distance:"olympic", weeks:6, startDate:new Date("2026-10-12"), weeklyHours:12});
    assert.equal(weeks.length, 6);
    assert.deepEqual(weeks.map(w => w.sessions.filter(s => s.type === "plyo").length), [1,1,1,1,1,0]);
    for (const week of weeks) for (const session of week.sessions) {
      assert.ok(session.minutes > 0);
      assert.doesNotMatch(session.description, automaticPowerDose);
      if (session.type === "plyo") assert.match(session.description, /review/);
    }
  }
});

test("boxing, HYROX and sprint reserved strength slots do not supply unreviewed explosive doses", () => {
  const startDate = new Date("2026-10-12");
  for (const level of ["beginner", "amateur", "advanced", "pro"]) {
    const plans = [generateBoxingCamp({level, weeks:12, startDate}), generateHyroxPlan({level, weeks:12, startDate}), generateTrackSprint({level, event:"200m", weeks:12, startDate})];
    for (const weeks of plans) for (const week of weeks) for (const session of week.sessions) {
      assert.doesNotMatch(session.description, automaticPowerDose);
      if (session.type === "plyo") assert.match(session.description, /review/);
    }
  }
});

test("generic executable strength allocates controlled movement across intensity caps", () => {
  for (const variant of [0,1,2,3]) for (const type of ["strength", "plyo"]) for (const zone of ["z1", "z2", "z3", "z4"]) {
    const steps = structuredSteps(50, zone, type, variant, "strength");
    assert.equal(steps.reduce((sum,s) => sum + s.seconds,0), 50 * 60);
    assert.ok(steps.every(s => Number(s.zone.slice(1)) <= Number(zone.slice(1))));
    assert.doesNotMatch(JSON.stringify(steps), automaticPowerDose);
    assert.ok(steps.every(s => !/jumps|Plyometrics|Kettlebell Swing|Push Press/.test(s.name)));
  }
});

test("boxing strength detail fallback supplies no explosive circuit", () => {
  const detail = buildSessionDetail({sport:"boxing", type:"strength", zone:"z3", minutes:50, description:""});
  assert.doesNotMatch(detail.main, /8 explosive push-ups|10 rotational throws|Every rep FAST/);
  assert.match(detail.main, /familiar coach-reviewed/);
});

test("legacy plyometric source ID now identifies a limited performance review", () => {
  const source = RESEARCH_SOURCES.find(s => s.id === "ramirezcampillo2022")!;
  assert.equal(source.level, "B");
  assert.match(source.ref, /PMID 33956587/);
  assert.match(source.claim, /do not establish injury prevention/);
});
