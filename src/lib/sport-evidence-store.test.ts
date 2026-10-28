import test from "node:test";
import assert from "node:assert/strict";
import { recoverLatestGarmin } from "./sport-evidence-store";
import { encryptSecret } from "./crypto";
import { readSportMeasurements } from "./sport-measurements";
const row={id:"workout",userId:"owner",source:"garmin_direct",externalId:"garmin:sample",sport:"bike",date:new Date("2026-10-27T12:00Z"),durationMin:60,actualDurationMin:60,distanceKm:30,planned:false,completed:true};
const connection={status:"connected",externalRef:"synthetic-provider",scope:"ACTIVITY_EXPORT"};
test("legacy recovery is owned, authorized, bounded, processed-only and exactly bound to the stored activity",async()=>{
  const prior=process.env.TOKEN_ENCRYPTION_KEY;process.env.TOKEN_ENCRYPTION_KEY="synthetic-sport-test-key";
  try {
    const summary={type:"activities",providerUserId:"synthetic-provider",summaryId:"sample",record:{userId:"synthetic-provider",summaryId:"sample",durationInSeconds:3591,startTimeInSeconds:row.date.getTime()/1000,activityType:"CYCLING",distanceInMeters:30000}};
    let calls=0,status="done",payload=encryptSecret(JSON.stringify(summary));
    const db={syncJob:{findFirst:async(args:any)=>{calls++;assert.equal(args.where.userId,"owner");assert.equal(args.where.kind,"garmin.data.v1");assert.equal(args.where.OR.length,2);assert.equal(args.select.payload,true);return {status,payload};}}} as any;
    const result=await recoverLatestGarmin([row],"owner",connection,db);
    assert.equal(readSportMeasurements(result[0].actualDetails,"bike","garmin_direct")?.durationSeconds,3591);assert.equal(calls,1);
    for(const c of [null,{...connection,status:"disconnected"},{...connection,scope:"HEALTH_EXPORT"}]){const before:number=calls;assert.deepEqual(await recoverLatestGarmin([row],"owner",c,db),[row]);assert.equal(calls,before);}
    status="pending";assert.deepEqual(await recoverLatestGarmin([row],"owner",connection,db),[row]);status="done";
    for(const changed of [{...summary,providerUserId:"another"},{...summary,record:{...summary.record,userId:"another"}},{...summary,record:{...summary.record,distanceInMeters:10000}}]){
      payload=encryptSecret(JSON.stringify(changed));assert.deepEqual(await recoverLatestGarmin([row],"owner",connection,db),[row]);
    }
    const before=calls;await recoverLatestGarmin(Array.from({length:100},(_,i)=>({...row,id:String(i)})),"owner",connection,db);assert.equal(calls,before+1);
  }finally{if(prior===undefined)delete process.env.TOKEN_ENCRYPTION_KEY;else process.env.TOKEN_ENCRYPTION_KEY=prior;}
});
