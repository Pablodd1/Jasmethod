import assert from "node:assert/strict";
import test from "node:test";
import { isUnperformedSupersededWorkout } from "./superseded-workout";
import { effectiveSessionFromRecords } from "./effective-prescription";

test("unperformed retired suggestions never become actual or unknown execution evidence", () => {
  for (const source of ["superseded-plan", "superseded-starter", "superseded-starter-rest"]) {
    const retired = { source, planned: false, completed: false, durationMin: 20 };
    assert.equal(isUnperformedSupersededWorkout(retired), true);
    for (const recorded of [{ completed: true }, { feedbackStatus: "unknown" }, { feedbackStatus: "skipped" },
      { feedbackAt: new Date() }, { feedbackNote: "" }, { actualDurationMin: 0 }, { actualSport: "swim" },
      { actualDetails: "{}" }, { rpe: 0 }, { avgHr: 120 }, { maxHr: 150 }, { avgPower: 0 }, { np: 0 },
      { distanceKm: 0 }, { distanceKm: 12 }, { preWeightKg: 64 }, { postWeightKg: 64 }, { externalId: "imported" }, { matchedPlanId: "actual" }]) {
      assert.equal(isUnperformedSupersededWorkout({ ...retired, ...recorded }), false, JSON.stringify(recorded));
    }
  }
  for (const source of [null, undefined, "manual", "garmin", "strava", "plan", "starter"]) {
    assert.equal(isUnperformedSupersededWorkout({ source, planned: false }), false);
  }
});

test("retiring an unperformed starter after check-in does not invalidate the replacement prescription, but actual feedback still does", () => {
  const date = new Date("2026-10-15T00:00:00Z"), now = new Date("2026-10-15T12:00:00Z");
  const answers = { sleep:4,soreness:1,motivation:4,energy:4,stress:1,sick:false,newPain:false,urgentSymptoms:false,availableMin:60,inputMetadata:{recordedAt:"2026-10-15T09:00:00Z"} };
  const input = { userId:"athlete",timezone:"UTC",now,planning:{ready:true,missing:[],review:[],ruleId:"fixture"},
    workout:{id:"current",userId:"athlete",date,title:"Easy bike",sport:"bike",durationMin:1,intensity:"z2",type:"endurance",prescription:JSON.stringify({sport:"bike",durationMin:1,verdict:"full",steps:[{name:"Easy",seconds:60,zone:"z2",phase:"active"}]})},
    checkin:{date,answers:JSON.stringify(answers),adaptation:JSON.stringify({verdict:"full",intensityCap:"z7",durationFactor:1})} };
  const baseline = effectiveSessionFromRecords(input).canonical;
  assert.equal(baseline.verdict, "ready");
  const retired = {id:"old",userId:"athlete",date,createdAt:new Date("2026-10-15T10:00:00Z"),source:"superseded-starter",planned:false,completed:false,durationMin:20};
  const unperformed = effectiveSessionFromRecords({...input,reportedActivity:[retired]}).canonical;
  assert.equal(unperformed.verdict,"ready"); assert.equal(unperformed.revision,baseline.revision);
  const actual = effectiveSessionFromRecords({...input,reportedActivity:[{...retired,feedbackAt:new Date("2026-10-15T10:00:00Z"),feedbackStatus:"unknown"}]}).canonical;
  assert.equal(actual.verdict,"blocked"); assert.match(actual.reason,/after this check-in/);
  for (const distanceKm of [0,12]) {
    const distanceOnly = effectiveSessionFromRecords({...input,reportedActivity:[{...retired,distanceKm}]}).canonical;
    assert.equal(distanceOnly.verdict,"blocked"); assert.match(distanceOnly.reason,/after this check-in/);
  }
});
