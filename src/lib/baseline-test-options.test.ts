import test from "node:test";
import assert from "node:assert/strict";
import { baselineSport, baselineTestOptions, initialAssessmentEvidence } from "./baseline-test-options";
test("baseline recording separates sport-specific references and keeps multisport references independent",()=>{
  assert.equal(baselineSport("half"),"multisport");assert.equal(baselineSport("cycle"),"bike");assert.equal(baselineSport("swim-only"),"swim");
  assert.deepEqual(baselineTestOptions("bike").map(t=>t.type),["ftp","cp"]);
  assert.deepEqual(baselineTestOptions("swim").map(t=>t.type),["swim"]);
  assert.deepEqual(baselineTestOptions("hyrox").map(t=>t.type),["run5k","lthr"]);
  assert.equal(baselineTestOptions("multisport").length,5);
});
test("initial assessment offers distinguish genuinely empty evidence from stored history, personal records and unreadable records",()=>{
  assert.equal(initialAssessmentEvidence(0,null,0).needsInitialAssessment,true);
  for(const [history,records,tests] of [[1,null,0],[0,null,1],[0,JSON.stringify([{label:"run 5K",value:24,unit:"min",date:"2026-01-01"}]),0]] as const)assert.equal(initialAssessmentEvidence(history,records,tests).needsInitialAssessment,false);
  for(const records of ["{","null","[null]",JSON.stringify([{label:"Invalid",value:-1,unit:"min",date:""}])]){const evidence=initialAssessmentEvidence(0,records,0);assert.equal(evidence.personalRecords,"review");assert.equal(evidence.needsInitialAssessment,false);}
});
