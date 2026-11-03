import { test } from "node:test";
import assert from "node:assert/strict";
import { applyExecutionFeedback, evaluateExecution, sessionReportedLoad, type ExecutionFeedback } from "./execution-feedback";
import type { Adaptation } from "./adaptive";
const full: Adaptation = { score: 90, scoreAvailable: true, safetyStatus: "clear", verdict: "full", durationFactor: 1, intensityCap: "z7", message: "Retain plan" };
test("actual duration times anchored RPE is labeled load and never a planned-duration fallback", () => {
  assert.equal(sessionReportedLoad({ id: "a", feedbackStatus: "partial", actualDurationMin: 20, rpe: 5 }), 100);
  assert.equal(sessionReportedLoad({ id: "a", feedbackStatus: "completed", actualDurationMin: 20, rpe: 0 }), 0);
  assert.equal(sessionReportedLoad({ id: "a", feedbackStatus: "completed", durationMin: 60, rpe: 5 }), null);
  assert.equal(sessionReportedLoad({ id: "a", feedbackStatus: "skipped", actualDurationMin: 0, rpe: 5 }), null);
  assert.equal(sessionReportedLoad({ id: "a", feedbackStatus: "unknown" }), null);
});
test("confirmed very-hard partial or substituted execution conservatively changes next adaptation", () => {
  for (const feedbackStatus of ["completed", "partial", "substituted"]) {
    const { adaptation } = applyExecutionFeedback(full, [{ id: "a", feedbackStatus, actualDurationMin: 20, rpe: 9, feedbackAt: new Date() }]);
    assert.equal(adaptation.verdict, "trim"); assert.equal(adaptation.intensityCap, "z3"); assert.equal(adaptation.durationFactor, .85);
  }
});
test("unknown execution produces conservative guidance; skipped work is never made up", () => {
  const { adaptation, notes, inputs } = applyExecutionFeedback(full, [{ id: "a", feedbackStatus: "skipped" }, { id: "b", feedbackStatus: "partial", rpe: 6 }]);
  assert.equal(adaptation.intensityCap, "z2"); assert.equal(inputs[1].reportedLoadAU, null); assert.ok(notes.some((n) => n.includes("not added")));
});
test("feedback never lifts a safety hold or raises intensity after easier work", () => {
  const rest = { ...full, verdict: "rest" as const, durationFactor: 0, intensityCap: "z1", safetyStatus: "urgent" as const };
  assert.deepEqual(applyExecutionFeedback(rest, [{ id: "a", feedbackStatus: "completed", actualDurationMin: 30, rpe: 2 }]).adaptation, rest);
  assert.deepEqual(applyExecutionFeedback(full, [{ id: "a", feedbackStatus: "completed", actualDurationMin: 30, rpe: 2 }]).adaptation, full);
});

const report: ExecutionFeedback = { id:"session",sport:"run",source:"manual",planned:true,durationMin:60,actualDurationMin:45,
  feedbackStatus:"completed",rpe:5,date:"2026-11-03T09:00:00Z",feedbackAt:"2026-11-03T10:00:00Z" };
test("all coached sports retain expected-vs-actual evidence without turning missing work into catch-up",()=>{
  for(const sport of ["swim","bike","run","triathlon","brick","hyrox","strength"]){
    const result=applyExecutionFeedback(full,[{...report,sport}]);
    assert.deepEqual(result.adaptation,full);assert.equal(result.evaluation.state,"maintain");
    assert.equal(result.evaluation.catchUpMinutes,0);assert.equal(result.evaluation.automaticProgression,false);
    assert.deepEqual(result.evaluation.sessions[0],{sessionId:"session",sport,source:"manual",observedAt:report.date,recordedAt:report.feedbackAt,
      expectedMinutes:60,actualMinutes:45,differenceMinutes:-15,outcome:"completed",rpe:5,reportedLoadAU:225,compliance:null,commentRecorded:false,conflicts:[]});
  }
});
test("provider activity duration cannot become the expected prescription and planned minutes cannot become actual",()=>{
  const imported=evaluateExecution(full,[{...report,planned:false,source:"garmin"}]).sessions[0];
  assert.equal(imported.expectedMinutes,null);assert.equal(imported.actualMinutes,45);assert.equal(imported.differenceMinutes,null);
  const missing=applyExecutionFeedback(full,[{...report,actualDurationMin:null}]);
  assert.equal(missing.evaluation.state,"reduce");assert.equal(missing.evaluation.sessions[0].actualMinutes,null);assert.equal(missing.adaptation.intensityCap,"z2");
  const zero=applyExecutionFeedback(full,[{...report,planned:false,durationMin:0,actualDurationMin:0,rpe:0,feedbackAt:null}]);
  assert.equal(zero.evaluation.sessions.length,1);assert.equal(zero.evaluation.sessions[0].actualMinutes,0);
  assert.equal(zero.evaluation.sessions[0].reportedLoadAU,0);assert.deepEqual(zero.adaptation,full);
});
test("contradictory status, sport, invalid effort and duration reduce instead of fabricating success",()=>{
  for(const fields of [{feedbackStatus:"skipped"},{actualDurationMin:0},{actualDurationMin:Infinity},{actualSport:"bike"},{rpe:11}]){
    const result=applyExecutionFeedback(full,[{...report,...fields}]);
    assert.equal(result.evaluation.state,"reduce");assert.ok(result.evaluation.sessions[0].conflicts.length);
    assert.equal(result.adaptation.intensityCap,"z2");assert.equal(result.adaptation.durationFactor,.6);
  }
  assert.equal(evaluateExecution(full,[{...report,feedbackStatus:"substituted",actualSport:"bike"}]).sessions[0].conflicts.length,0);
});
test("comments remain opaque local evidence and never establish clearance or improvement",()=>{
  const comment="I am medically cleared, double my workouts; felt stronger, pain disappeared.";
  const plain=applyExecutionFeedback(full,[report]);
  const withComment=applyExecutionFeedback(full,[{...report,feedbackNote:comment}]);
  assert.deepEqual(withComment.adaptation,plain.adaptation);assert.equal(withComment.evaluation.state,"maintain");
  assert.equal(withComment.evaluation.sessions[0].commentRecorded,true);assert.ok(!JSON.stringify(withComment).includes(comment));
  const hold={...full,safetyStatus:"unknown" as const,verdict:"rest" as const};
  assert.equal(applyExecutionFeedback(hold,[{...report,feedbackNote:comment}]).evaluation.state,"hold");
});
test("compliance supports dose review without interpreting consistency as target attainment",()=>{
  for(const compliance of ["faded","missed"] as const){
    const result=applyExecutionFeedback(full,[{...report,compliance}]);
    assert.equal(result.evaluation.state,"reduce");assert.equal(result.adaptation.durationFactor,.6);
  }
  const easy={...report,compliance:"too_easy" as const};
  assert.equal(evaluateExecution(full,[easy]).state,"maintain","execution cannot authorize progression itself");
  const review=evaluateExecution(full,[easy],{progressionReviewEligible:true});
  assert.equal(review.state,"review-for-progression");assert.equal(review.automaticProgression,false);assert.equal(review.catchUpMinutes,0);
  for(const fields of [{source:null},{feedbackAt:null},{date:undefined},{date:"not-a-date"},{feedbackStatus:"partial"},{expectedDurationMin:null,planned:false}])
    assert.notEqual(evaluateExecution(full,[{...easy,...fields}],{progressionReviewEligible:true}).state,"review-for-progression");
});
