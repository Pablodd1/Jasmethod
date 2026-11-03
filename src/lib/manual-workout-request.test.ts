import test from "node:test";
import assert from "node:assert/strict";
import { manualWorkoutAttempt, manualWorkoutPayloadKey, manualWorkoutRequestId } from "./manual-workout-request";

test("an uncertain activity request keeps its ID across retry and form field ordering",()=>{
  let calls=0;
  const createId=()=>`synthetic-${++calls}`;
  const fields={sport:"bike",date:"2026-11-03",actualDurationMin:"30",rpe:"3"};
  const first=manualWorkoutAttempt(null,fields,createId);
  const afterFailure=manualWorkoutAttempt(first,{rpe:"3",actualDurationMin:"30",date:"2026-11-03",sport:"bike"},createId);
  assert.equal(afterFailure.clientRequestId,first.clientRequestId);
  assert.equal(calls,1);
  assert.equal(manualWorkoutPayloadKey({...fields,clientRequestId:"one"}),manualWorkoutPayloadKey({...fields,clientRequestId:"two"}));
});

test("changed payload and explicit new intent receive new IDs without fuzzy deduplication",()=>{
  let calls=0;
  const createId=()=>`synthetic-${++calls}`;
  const fields={sport:"run",actualDurationMin:"30"};
  const first=manualWorkoutAttempt(null,fields,createId);
  const changed=manualWorkoutAttempt(first,{...fields,actualDurationMin:"31"},createId);
  const intentionallySameValues=manualWorkoutAttempt(null,fields,createId);
  assert.notEqual(changed.clientRequestId,first.clientRequestId);
  assert.notEqual(intentionallySameValues.clientRequestId,first.clientRequestId);
});

test("request IDs are validated; absent legacy IDs are explicitly outside replay protection",()=>{
  assert.equal(manualWorkoutRequestId({sport:"run"}),null);
  assert.equal(manualWorkoutRequestId({clientRequestId:"synthetic-valid_123"}),"synthetic-valid_123");
  for(const value of [null,{},[],true,"","bad id","a".repeat(129)])assert.throws(()=>manualWorkoutRequestId({clientRequestId:value}));
});
