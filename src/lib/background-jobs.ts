import { randomUUID } from 'node:crypto';
import { prisma } from './db';
export async function enqueueSyncJob(userId: string, kind: 'sync'|'strava'|'whoop'|'intervals', dedupeKey: string, payload: unknown) {
  return prisma.syncJob.upsert({where:{dedupeKey},update:{},create:{userId,kind,dedupeKey,payload:JSON.stringify(payload)}});
}
export async function processSyncJob(job: { userId:string;kind:string;payload:string }) {
  const payload=JSON.parse(job.payload);
  if(job.kind==='sync') {
    const {syncUserConnectors}=await import('./sync');
    if(!['oura','whoop','strava','google_cal','intervals'].includes(payload.provider)) throw new Error('Unsupported provider');
    const result=await syncUserConnectors(job.userId,payload.provider);
    if(result.results.some(r=>!r.ok)) throw new Error('Provider reconciliation failed');
  } else if(job.kind==='intervals') {
    const {processIntervalsEvent}=await import('./intervals-ingest');
    await processIntervalsEvent(job.userId,payload);
  } else if(job.kind==='whoop'||job.kind==='strava') {
    const worker=job.kind==='whoop'?await import('./worker-whoop'):await import('./worker-strava');
    const response=await worker.processVerifiedEvent(new Request('http://localhost/internal-event',{method:'POST',body:JSON.stringify(payload)}),job.userId);
    if(!response.ok) throw new Error('Provider event failed');
  } else throw new Error('Unsupported job');
}
// Injection is only a test seam; the HTTP endpoint always uses the real processor.
export async function runSyncJobs(limit=4, process=processSyncJob) {
  const now=new Date();
  await prisma.syncJob.updateMany({where:{status:'running',leasedUntil:{lt:now},attempts:{lt:5}},data:{status:'pending',leaseToken:null,leasedUntil:null}});
  await prisma.syncJob.updateMany({where:{status:'running',leasedUntil:{lt:now},attempts:{gte:5}},data:{status:'failed',leaseToken:null,leasedUntil:null,lastError:'Repeated interrupted processing; operator review required.'}});
  const jobs=await prisma.syncJob.findMany({where:{status:'pending',availableAt:{lte:now}},orderBy:{availableAt:'asc'},take:Math.max(1,Math.min(20,limit))});
  return Promise.all(jobs.map(async job=>{
    const token=randomUUID();
    const claim=await prisma.syncJob.updateMany({where:{id:job.id,status:'pending'},data:{status:'running',leaseToken:token,attempts:{increment:1},leasedUntil:new Date(Date.now()+15*60000)}});
    if(!claim.count)return {id:job.id,status:'claimed_elsewhere'};
    try {
      await process(job);
      const done=await prisma.syncJob.updateMany({where:{id:job.id,status:'running',leaseToken:token},data:{status:'done',leaseToken:null,leasedUntil:null,lastError:null}});
      return {id:job.id,status:done.count?'done':'lease_lost'};
    } catch {
      const status=job.attempts+1>=5?'failed':'pending';
      const result=await prisma.syncJob.updateMany({where:{id:job.id,status:'running',leaseToken:token},data:{status,leaseToken:null,leasedUntil:null,availableAt:new Date(Date.now()+Math.min(3600000,30000*2**job.attempts)),lastError:'Processing failed; inspect connector status. Reconnect if authorization expired.'}});
      return {id:job.id,status:result.count?(status==='pending'?'retrying':'failed'):'lease_lost'};
    }
  }));
}
