import test from "node:test";
import assert from "node:assert/strict";
import {createGarminJobRunner} from "./garmin-jobs";
import {GarminBudgetError} from "./garmin-config";
import {createGarminTrainingProtocol,GarminTrainingError} from "./garmin-training-protocol";
test("fifty athletes keep fair position after a shared app budget is exhausted",async()=>{
 const cursor=new Map(Array.from({length:50},(_,i)=>[`athlete-${String(i).padStart(2,"0")}`,0]));let tick=0,remaining=3;const completed=new Set<string>();
 const runner=createGarminJobRunner({configured:()=>true,trainingEnabled:()=>true,now:()=>0,
  users:async()=>[...cursor.entries()].sort((a,b)=>a[1]-b[1]||a[0].localeCompare(b[0])).map(([userId])=>({userId})),
  markVisited:async id=>{cursor.set(id,++tick);completed.add(id);},
  inbox:async(_id,limit)=>{assert.equal(limit,2);return {processed:0,budgetDeferred:false};},
  publish:async()=>remaining-->0?{published:1,cancelled:0,attention:0}:{published:0,cancelled:0,attention:0,budgetDeferred:true}});
 const first=await runner(100);assert.equal(first.published,3);assert.equal(first.deferred,47);assert.equal(cursor.get("athlete-03"),0);
 for(let i=0;i<17;i++){remaining=3;await runner(100);}assert.equal(completed.size,50);
});
test("inbox global deferral does not advance the refused athlete or publish new work",async()=>{let visited=0,published=0;const runner=createGarminJobRunner({configured:()=>true,trainingEnabled:()=>true,now:()=>0,users:async()=>[{userId:"A"},{userId:"B"}],markVisited:async()=>{visited++;},inbox:async()=>({processed:1,budgetDeferred:true}),publish:async()=>{published++;return {published:1,cancelled:0,attention:0};}});const r=await runner(100);assert.equal(visited,0);assert.equal(published,0);assert.equal(r.deferred,2);});
test("an athlete-specific quota remains distinct from a global provider cooldown",async()=>{const protocol=createGarminTrainingProtocol(async()=>{throw new GarminBudgetError("athlete",3600000);});await assert.rejects(protocol.schedules("SYNTHETIC","2026-10-26"),(e:unknown)=>e instanceof GarminTrainingError && e.budgetScope==="athlete" && e.retryAfterMs===3600000);});
