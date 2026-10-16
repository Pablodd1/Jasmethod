import test from "node:test";
import assert from "node:assert/strict";
import {prisma} from "./db";
import {storeActivity} from "./activity-store";
test("ingest preserves distinct provider observations while the same provider external ID remains idempotent",async()=>{
 const original=prisma.$transaction,rows:any[]=[];
 const tx:any={$executeRaw:async()=>{},workout:{findFirst:async({where}:any)=>{assert.equal(where.userId,"owner");assert.ok(where.source&&where.externalId,"ingest cannot silently discard a record using a start/duration-only query");return rows.find(r=>r.source===where.source&&r.externalId===where.externalId)||null;},findMany:async()=>[],create:async({data}:any)=>{const row={id:`row-${rows.length}`,...data};rows.push(row);return row;},update:async({where,data}:any)=>{const row=rows.find(r=>r.id===where.id);Object.assign(row,data);return row;},updateMany:async()=>({count:0})}};
 (prisma as any).$transaction=async(fn:any)=>fn(tx);
 try{
  const input={date:new Date(Date.now()-72*3600000),sport:"bike",title:"Synthetic original",durationMin:60,distanceKm:30};
  assert.equal(await storeActivity("owner","UTC",{...input,source:"garmin",externalId:"g1"}),true);
  assert.equal(await storeActivity("owner","UTC",{...input,source:"strava",externalId:"s1"}),true);assert.equal(rows.length,2);
  assert.equal(await storeActivity("owner","UTC",{...input,source:"garmin",externalId:"g1",avgPower:150}),false);assert.equal(rows.length,2);assert.equal(rows[0].avgPower,150);assert.equal(rows[1].avgPower,undefined);
 }finally{(prisma as any).$transaction=original;}
});
