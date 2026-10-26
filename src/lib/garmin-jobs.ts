import { prisma } from "./db";
import { garminConfigured } from "./garmin-config";
import { processGarminInbox } from "./garmin-inbox";
import { reconcileGarminPublications } from "./garmin-delivery";
/** Existing five-minute worker; no new cron, credentials or provider subscriptions. */
export async function runGarminJobs(deadline=Date.now()+180000){
 const totals={athletes:0,processed:0,published:0,cancelled:0,attention:0,deferred:0};
 if(!garminConfigured())return totals;
 const users=await prisma.connector.findMany({where:{provider:"garmin_direct",status:"connected"},select:{userId:true},orderBy:[{lastSyncAt:"asc"},{id:"asc"}]});
 for(const c of users){
  if(Date.now()>deadline){totals.deferred=users.length-totals.athletes;break;}
  totals.athletes++;
  try{
   totals.processed+=(await processGarminInbox(c.userId,10)).processed;
   if(process.env.ENABLE_GARMIN_TRAINING==="true"){
    const result=await reconcileGarminPublications(c.userId,deadline);
    totals.published+=result.published;totals.cancelled+=result.cancelled;totals.attention+=result.attention;
   }
  }catch{totals.attention++;}
  // Oldest cursor first on the next invocation prevents a busy athlete monopolizing the queue.
  await prisma.connector.updateMany({where:{userId:c.userId,provider:"garmin_direct",status:"connected"},data:{lastSyncAt:new Date()}});
 }
 return totals;
}
