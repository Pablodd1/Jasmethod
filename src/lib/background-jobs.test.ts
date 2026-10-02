import test from 'node:test';
import assert from 'node:assert/strict';
import { prisma } from './db';
import { runSyncJobs, enqueueSyncJob } from './background-jobs';
import { queueVerifiedProviderEvent } from './webhook-queue';

test('durable worker retries errors, fences completion by lease, and caps interrupted attempts',async()=>{
  const model=prisma.syncJob;
  const original={updateMany:model.updateMany,findMany:model.findMany};
  const writes:any[]=[];let mode='retry';let executions=0;
  (model as any).findMany=async()=>[{id:'j',userId:'a',kind:'sync',payload:'{}',attempts:mode==='dead'?4:0}];
  (model as any).updateMany=async(arg:any)=>{
    writes.push(arg);
    if(arg.data.status==='running' && mode==='contended')return {count:0};
    if(arg.data.status==='done' && mode==='fenced')return {count:0};
    return {count:1};
  };
  try {
    let result=await runSyncJobs(1,async()=>{executions++;throw Error('temporary provider failure')});
    assert.equal(result[0].status,'retrying');
    assert.equal(writes.at(-1).data.status,'pending');assert.ok(writes.at(-1).where.leaseToken);
    assert.deepEqual(writes[1].where.attempts,{gte:5});assert.equal(writes[1].data.status,'failed');
    mode='dead';result=await runSyncJobs(1,async()=>{throw Error('failure')});assert.equal(result[0].status,'failed');
    mode='contended';const before=executions;result=await runSyncJobs(1,async()=>{executions++});assert.equal(result[0].status,'claimed_elsewhere');assert.equal(executions,before);
    mode='fenced';result=await runSyncJobs(1,async()=>{});assert.equal(result[0].status,'lease_lost');
  }finally{Object.assign(model,original);}
});

test('webhook acknowledges only durable enqueue and scopes job to matched athlete',async()=>{
  const originals={findFirst:prisma.connector.findFirst,upsert:prisma.syncJob.upsert};
  const writes:any[]=[];
  (prisma.connector as any).findFirst=async()=>({id:'conn',userId:'athlete'});
  (prisma.syncJob as any).upsert=async(arg:any)=>{writes.push(arg);return {id:'job'}};
  try {
    const body={owner_id:123,object_id:456,aspect_type:'update',event_time:10,updates:{title:'one'}};
    assert.equal((await queueVerifiedProviderEvent('strava',body)).status,200);
    assert.equal(writes[0].create.userId,'athlete');
    await queueVerifiedProviderEvent('strava',{...body,updates:{title:'two'}});
    assert.notEqual(writes[0].where.dedupeKey,writes[1].where.dedupeKey);
    await queueVerifiedProviderEvent('strava',body);assert.equal(writes[0].where.dedupeKey,writes[2].where.dedupeKey);
    (prisma.syncJob as any).upsert=async()=>{throw Error('storage unavailable')};
    await assert.rejects(queueVerifiedProviderEvent('strava',body),/storage unavailable/);
    await assert.rejects(enqueueSyncJob('athlete','sync','initial',{provider:'oura'}),/storage unavailable/);
  }finally{(prisma.connector as any).findFirst=originals.findFirst;(prisma.syncJob as any).upsert=originals.upsert;}
});
