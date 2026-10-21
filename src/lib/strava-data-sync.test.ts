import * as deviceMetricSnapshot from "./device-metric-snapshot";
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import * as dates from "./dates";
import { stravaActivityToWorkout, StravaActivityDataError } from "./importers";
import { isSyncAuthFailure } from "./sync-errors";

const activity = {id:123, type:"Run", start_date:"2026-10-10T12:00:00Z", moving_time:20, elapsed_time:30};
test("short Strava activities retain source seconds instead of becoming invalid zero minutes", () => {
  const w = stravaActivityToWorkout(activity);
  assert.equal(w.durationMin,1);
  assert.match(w.notes!, /moving duration: 20 seconds/);
  assert.equal(stravaActivityToWorkout({...activity,moving_time:90}).durationMin,2);
});
test("zero moving time uses positive elapsed time with explicit provenance", () => {
  const w = stravaActivityToWorkout({...activity,moving_time:0,elapsed_time:180});
  assert.equal(w.durationMin,3);
  assert.match(w.notes!, /elapsed duration: 180 seconds/);
});
test("invalid source records fail with a data error without invented dates or IDs", () => {
  for(const a of [null, {...activity,id:undefined}, {...activity,start_date:null}, {...activity,start_date:"bad"}, {...activity,moving_time:0,elapsed_time:0}, {...activity,moving_time:NaN,elapsed_time:Infinity}])
    assert.throws(()=>stravaActivityToWorkout(a), StravaActivityDataError);
});
test("data errors do not trigger authentication alerts; actual auth failures do", () => {
  for(const msg of ["Activity has invalid date or duration", "Invalid Strava activity response", "Strava activity data needs review: 1 record. No reconnect required for this data error.", "Provider failed: 500"])
    assert.equal(isSyncAuthFailure(msg),false,msg);
  for(const msg of ["Strava activities failed: 401", "invalid_grant", "invalid access token", "Reconnect Strava", "Unauthorized", "authorization expired"])
    assert.equal(isSyncAuthFailure(msg),true,msg);
});

// Execute real sync orchestration with synthetic boundaries: no provider or DB traffic.
function fixture(records:any[], failAt?:number) {
  const writes:any[] = [], updates:any[] = [];
  const deps:Record<string,any> = {
    "./dates":dates,
    "./device-metric-snapshot":deviceMetricSnapshot,
    "./db":{prisma:{
      user:{findUniqueOrThrow:async()=>({timezone:"UTC",profile:null})},
      connector:{findMany:async()=>[{id:"connector",provider:"strava",tokenEnc:"synthetic",lastSyncAt:new Date("2026-10-01")}],updateMany:async(arg:any)=>{updates.push(arg);return{count:1};}},
      $transaction:async(fn:any)=>fn({$executeRaw:async()=>1,athleteProfile:{findUnique:async()=>null}}),
    }},
    "./crypto":{decryptSecret:()=>"synthetic"},
    "./importers":{stravaActivityToWorkout,StravaActivityDataError,stravaGetActivities:async()=>records},
    "./activity-store":{storeActivity:async(user:string,_tz:string,w:any)=>{assert.equal(user,"athlete");if(w.externalId===`strava:${failAt}`)throw Error("Database unavailable");writes.push(w);return true;}},
    "./profile-import-review":{importStravaProfileWeight:async()=>{}},
    "./telemetry":{meterUsage:async()=>{}},
    "./manual-workout-calendar":{},"./calendar-workouts":{},"./manual-workout-email-locale":{},"./manual-workout-email":{},"./manual-workout-email-content":{},"./effective-prescription":{},"./canonical-session":{},"./capabilities":{stravaConnectorEnabled:()=>true},
  };
  const mod:any={exports:{}};
  const compiled=ts.transpileModule(fs.readFileSync("src/lib/sync.ts","utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  vm.runInNewContext(compiled,{module:mod,exports:mod.exports,Date,console,process:{env:{}},require:(id:string)=>{if(id in deps)return deps[id];throw Error(`Unmocked dependency: ${id}`);}});
  return {writes,updates,run:()=>mod.exports.syncUserConnectors("athlete","strava")};
}
test("bad record between valid records cannot block imports or advance retry cursor",async()=>{
  const f=fixture([activity,{...activity,id:124,start_date:"bad"},{...activity,id:125}]);
  const result=await f.run();
  assert.equal(result.total,2);assert.equal(result.results[0].ok,false);
  assert.deepEqual(f.writes.map(w=>w.externalId),["strava:123","strava:125"]);
  const saved=f.updates.at(-1).data;
  assert.equal(saved.lastSyncCount,2);assert.equal(saved.status,"error");
  assert.equal("lastSyncAt" in saved,false);assert.match(saved.lastError,/1 record/);
  assert.equal(isSyncAuthFailure(saved.lastError),false);
});
test("clean retry clears error and advances cursor",async()=>{
  const f=fixture([activity]);const result=await f.run();
  assert.equal(result.results[0].ok,true);assert.equal(f.updates.at(-1).data.lastError,null);
  assert.ok(f.updates.at(-1).data.lastSyncAt instanceof Date);
});
test("database failures are not swallowed as invalid activity data and counts remain truthful",async()=>{
  const f=fixture([activity,{...activity,id:125},{...activity,id:126}],125);
  const result=await f.run();assert.equal(result.results[0].ok,false);
  assert.equal(result.total,1);assert.equal(f.writes.length,1);
  assert.equal(result.results[0].error,"Database unavailable");
  assert.equal("lastSyncAt" in f.updates.at(-1).data,false);
});
