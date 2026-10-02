import { createHash } from 'node:crypto';
import { prisma } from './db';
import { enqueueSyncJob } from './background-jobs';
export async function queueVerifiedProviderEvent(provider:'strava'|'whoop',body:any) {
  const identity=String(provider==='strava'?body?.owner_id:(body?.user_id??body?.data?.user_id??''));
  if(!identity) return Response.json({error:'Missing provider identity'},{status:400});
  const connection=await prisma.connector.findFirst({where:{provider,externalRef:identity,status:{in:['connected','error']}}});
  if(!connection)return Response.json({ok:true,unlinked:true});
  // Include update contents as well as object/time; different legitimate
  // updates in the same second must not collide. Duplicate JSON is harmless.
  const payload=JSON.stringify(body);
  const digest=createHash('sha256').update(payload).digest('hex');
  const job=await enqueueSyncJob(connection.userId,provider,`${provider}:${connection.id}:${digest}`,body);
  return Response.json({ok:true,queued:true,jobId:job.id});
}
