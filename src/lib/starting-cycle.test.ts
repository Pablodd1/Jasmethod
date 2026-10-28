import test from "node:test";
import assert from "node:assert/strict";
import { startingCycle, isStartingCycle } from "./starting-cycle";
test("missing baselines allow a labelled observation draft without invented physiology or progression",()=>{
  const p=startingCycle({birthYear:1990,goal:"run-only"},null,"2026-10-28",[],false,new Date("2026-10-28"));
  assert.equal(p.totalMinutes,60); assert.equal(p.scheduleSource,"suggested_for_review"); assert.equal(p.progression,false); assert.equal(p.physiologicalTargets,false);
  assert.equal(p.status,"daily_checkin_required"); assert.equal(p.days.length,7);
  assert.equal(isStartingCycle(p),true);assert.equal(isStartingCycle({...p,days:null}),false);assert.equal(isStartingCycle(null),false);
});
test("unknown eligibility, current restrictions and provenance holds produce review-only drafts",()=>{
  for(const [profile,restricted] of [[null,false],[{birthYear:2015},false],[{birthYear:2008},false],[{birthYear:1990,injured:true},false],[{birthYear:1990},true]] as const){
    const p=startingCycle(profile,null,"2026-10-28",[],restricted,new Date("2026-10-28"));
    assert.equal(p.totalMinutes,0);assert.equal(p.status,"review_required");assert.ok(p.reasons.length);
  }
});
test("existing activity days are protected and do not become zero completed training",()=>{
  const p=startingCycle({birthYear:1990,weeklyHours:.5},null,"2026-10-28",["2026-10-28"],false,new Date("2026-10-28"));
  assert.equal(p.days[0].kind,"existing_record");assert.equal(p.days[0].minutes,0);assert.equal(p.totalMinutes,30);
});
test("explicit zero availability is preserved, never replaced by a default dose",()=>{
  const p=startingCycle({birthYear:1990,weeklyHours:0},null,"2026-10-28",[],false,new Date("2026-10-28"));
  assert.equal(p.totalMinutes,0);assert.ok(p.reasons.some(reason=>reason.key==="availability"));
});
