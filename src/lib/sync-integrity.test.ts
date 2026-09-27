import test from 'node:test';
import assert from 'node:assert/strict';
import { physiologyReferencePatch, persistDeviceDay } from './sync';
import { selectUnambiguousPlan, storeActivity, deleteImportedActivities } from './activity-store';
import { prisma } from './db';
import { profilePatch } from './profile-update';
const now = new Date('2026-09-27T12:00:00Z');
const observations = Array.from({length:7}, (_,i) => ({
  observedAt: new Date(`2026-09-${20+i}T00:00:00Z`), metricType:'hrv_rmssd', value:50+i,
  source:'oura', measurementMethod:'device_sync',
}));
test('reference requires seven prior distinct days, one source and RMSSD, and protects existing reference', () => {
  assert.deepEqual(physiologyReferencePatch(observations, {}, 'UTC', now), {hrvBaseline:53});
  for (const bad of [observations.slice(0,3), observations.map(o=>({...o, source:'manual'})),
    observations.map(o=>({...o, metricType:'hrv_sdnn'})), observations.map(o=>({...o,qualityFlag:'suspect'})),
    observations.map((o,i)=>({...o,source:i===0?'whoop':'oura'})),
    observations.map(o=>({...o,observedAt:now}))])
    assert.deepEqual(physiologyReferencePatch(bad, {}, 'UTC', now), {});
  assert.deepEqual(physiologyReferencePatch(observations, {hrvBaseline:80}, 'UTC', now), {});
  assert.deepEqual(physiologyReferencePatch([...observations.slice(0,6), observations[0]], {}, 'UTC', now), {});
});
test('ambiguous sessions abstain independently of database order', () => {
  const morning={id:'morning',durationMin:40}, evening={id:'evening',durationMin:40};
  assert.equal(selectUnambiguousPlan([morning,evening],40),null);
  assert.equal(selectUnambiguousPlan([evening,morning],40),null);
  assert.equal(selectUnambiguousPlan([morning,{id:'long',durationMin:120}],40),morning);
  assert.equal(selectUnambiguousPlan([morning],5),null);
});
test('activity correction retracts old automatic match and re-evaluates corrected sport/day', async () => {
  const original=prisma.$transaction;
  const calls:any[]=[];
  const tx={ $executeRaw:async()=>1,workout:{
    findFirst:async()=>({id:'actual',date:new Date('2026-09-26'),sport:'run',durationMin:40}),
    updateMany:async(args:any)=>{calls.push(['clear',args]);return {count:1}},
    update:async(args:any)=>{calls.push(['update',args]);return args.data},
    findMany:async(args:any)=>{calls.push(['find',args]);return [{id:'bike-plan',durationMin:60}]},
  }};
  (prisma as any).$transaction=async(fn:any)=>fn(tx);
  try {
    assert.equal(await storeActivity('athlete','UTC',{externalId:'strava:1',source:'strava',sport:'bike',date:new Date('2026-09-27'),durationMin:60}),false);
    assert.equal(calls[0][1].where.userId,'athlete');
    assert.equal(calls[0][1].where.feedbackStatus,null);
    assert.equal(calls.find(c=>c[0]==='find')[1].where.sport,'bike');
    assert.equal(calls.find(c=>c[0]==='update')[1].data.sport,'bike');
    assert.deepEqual(calls.at(-1)[1].data,{completed:true,matchedPlanId:'actual'});
  } finally {(prisma as any).$transaction=original;}
});
test('provider deletion clears only automatic completion and remains scoped to athlete and provider',async()=>{
  const original=prisma.$transaction;const calls:any[]=[];
  (prisma as any).$transaction=async(fn:any)=>fn({$executeRaw:async()=>1,workout:{
    findMany:async(args:any)=>{calls.push(args);return [{id:'actual'}]},
    updateMany:async(args:any)=>{calls.push(args);return {count:1}},
    deleteMany:async(args:any)=>{calls.push(args);return {count:1}},
  }});
  try {
    assert.deepEqual(await deleteImportedActivities('athlete','strava',['strava:1']),{count:1});
    assert.equal(calls[0].where.userId,'athlete');assert.equal(calls[0].where.source,'strava');
    assert.deepEqual(calls[1].data,{completed:false,matchedPlanId:null});
    assert.equal(calls[1].where.feedbackStatus,null);
    assert.deepEqual(calls[2].data,{matchedPlanId:null});
    assert.deepEqual(calls[3].where.id,{in:['actual']});
  }finally{(prisma as any).$transaction=original;}
});
test('device-free profile accepts track sprint and preserves manual weight provenance',()=>{
  assert.deepEqual(profilePatch({goal:'track-sprint',weightKg:70,hrvBaseline:45},'UTC'),{goal:'track-sprint',weightKg:70,weightSource:'manual',hrvBaseline:45});
});

test('device snapshot replaces observations on repeat and protects manual summaries', async()=>{
  let observations:any[]=[];let updates:any[]=[];let previous:any={source:'manual',hrv:95};
  const tx={$executeRaw:async()=>1,metricObservation:{
    deleteMany:async()=>{observations=[];return {count:1}},
    createMany:async({data}:any)=>{observations.push(...data);return {count:data.length}},
  },dailyMetrics:{findUnique:async()=>previous,
    updateMany:async(args:any)=>{updates.push(args);return {count:1}},
    create:async(args:any)=>updates.push(args),
  }};
  const day=new Date('2026-09-26');
  for(let n=0;n<2;n++) await persistDeviceDay(tx,'athlete',day,'oura',{source:'oura',hrv:40},[{value:40}]);
  assert.equal(observations.length,1);assert.equal(updates.length,0);
  previous={source:'oura',hrv:40};
  await persistDeviceDay(tx,'athlete',day,'oura',{source:'oura',sleepHours:7},[{value:7}]);
  assert.equal(updates[0].data.hrv,null);assert.equal(updates[0].data.hrvType,null);
  assert.deepEqual(updates[0].where.source,{not:'manual'});
  updates=[];previous={source:'oura',hrv:40};
  await persistDeviceDay(tx,'athlete',day,'whoop',{source:'whoop',sleepHours:8},[{value:8}]);
  assert.equal(updates[0].data.source,'mixed');assert.equal('hrv' in updates[0].data,false);
});
import { claimDelivery, deliveryFailureStatus, reconcileStaleDeliveries, reminderSchedule } from './delivery-claim';
test('delivery retries only proven unsent failures with bounded CAS; ambiguous outcomes are not resent',async()=>{
  const originals={createMany:prisma.reminderDelivery.createMany,findUnique:prisma.reminderDelivery.findUnique,updateMany:prisma.reminderDelivery.updateMany};
  let previous:any={id:'delivery',status:'failed',attempts:1,lastAttemptAt:new Date('2026-09-27T10:00Z'),createdAt:new Date('2026-09-27T10:00Z'),error:'SMTP is not configured; no email was sent.'};
  const updates:any[]=[];
  (prisma.reminderDelivery as any).createMany=async()=>({count:0});
  (prisma.reminderDelivery as any).findUnique=async()=>previous;
  (prisma.reminderDelivery as any).updateMany=async(args:any)=>{updates.push(args);return {count:1}};
  try {
    assert.equal(await claimDelivery('athlete','2026-09-27','email',now),true);
    assert.equal(updates[0].where.attempts,1);assert.deepEqual(updates[0].data.attempts,{increment:1});
    previous={...previous,attempts:5};assert.equal(await claimDelivery('athlete','2026-09-27','email',now),false);
    previous={...previous,attempts:1,error:'socket timeout'};
    assert.equal(await claimDelivery('athlete','2026-09-27','email',now),false);
    assert.equal(updates.at(-1).data.status,'unknown');
    previous={...previous,status:'pending'};
    assert.equal(await claimDelivery('athlete','2026-09-27','email',now),false);
    await reconcileStaleDeliveries(now);
    assert.equal(updates.at(-1).where.status,'pending');assert.equal(updates.at(-1).data.status,'unknown');
    assert.equal(deliveryFailureStatus('provider may have accepted'),'unknown');
    assert.equal(deliveryFailureStatus('Telegram chat is not configured'),'failed');
  }finally{Object.assign(prisma.reminderDelivery,originals);}
});

test('digest lead time preserves tomorrow semantics and crosses midnight without losing minutes',()=>{
  const afternoon=reminderSchedule('UTC',13,120,new Date('2026-09-27T11:00Z'))!;
  assert.equal(afternoon.workoutDay,'2026-09-28');assert.equal(afternoon.claimDay,'2026-09-27');
  const midnight=reminderSchedule('UTC',1,120,new Date('2026-09-27T23:00Z'))!;
  assert.equal(midnight.workoutDay,'2026-09-28');assert.equal(midnight.claimDay,'2026-09-28');
  assert.equal(midnight.sendAt.toISOString(),'2026-09-27T23:00:00.000Z');
  assert.equal(reminderSchedule('UTC',7,30,new Date('2026-09-27T06:29Z')),null);
  assert.equal(reminderSchedule('UTC',7,30,new Date('2026-09-27T06:30Z'))!.sendAt.toISOString(),'2026-09-27T06:30:00.000Z');
});
