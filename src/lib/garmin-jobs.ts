import { prisma } from "./db";
import { garminConfigured } from "./garmin-config";
import { processGarminInbox } from "./garmin-inbox";
import { reconcileGarminPublications } from "./garmin-delivery";

type JobDependencies={
 configured:()=>boolean;trainingEnabled:()=>boolean;now:()=>number;
 users:()=>Promise<{userId:string}[]>;markVisited:(userId:string)=>Promise<unknown>;
 inbox:(userId:string,limit:number)=>Promise<{processed:number;budgetDeferred:boolean}>;
 publish:(userId:string,deadline:number)=>Promise<{published:number;cancelled:number;attention:number;budgetDeferred?:boolean}>;
};
/** Pure orchestration seam: production always supplies the real own-account processors below. */
export function createGarminJobRunner(deps:JobDependencies){
 return async(deadline:number)=>{
  const totals={athletes:0,processed:0,published:0,cancelled:0,attention:0,deferred:0};
  if(!deps.configured())return totals;
  const users=await deps.users();
  for(const c of users){
   if(deps.now()>deadline){totals.deferred=users.length-totals.athletes;break;}
   totals.athletes++;
   try{
    const inbox=await deps.inbox(c.userId,2);totals.processed+=inbox.processed;
    if(inbox.budgetDeferred){totals.deferred=users.length-totals.athletes+1;break;}
    if(deps.trainingEnabled()){
     const result=await deps.publish(c.userId,deadline);
     totals.published+=result.published;totals.cancelled+=result.cancelled;totals.attention+=result.attention;
     if(result.budgetDeferred){totals.deferred=users.length-totals.athletes+1;break;}
    }
   }catch{totals.attention++;}
   // A global budget refusal leaves this cursor untouched: it starts the next run.
   await deps.markVisited(c.userId);
  }
  return totals;
 };
}
/** Existing five-minute worker; no new cron, credentials or provider subscriptions. */
export async function runGarminJobs(deadline=Date.now()+180000){
 return createGarminJobRunner({configured:garminConfigured,trainingEnabled:()=>process.env.ENABLE_GARMIN_TRAINING==="true",now:Date.now,
  users:()=>prisma.connector.findMany({where:{provider:"garmin_direct",status:"connected"},select:{userId:true},orderBy:[{lastSyncAt:{sort:"asc",nulls:"first"}},{id:"asc"}]}),
  markVisited:userId=>prisma.connector.updateMany({where:{userId,provider:"garmin_direct",status:"connected"},data:{lastSyncAt:new Date()}}),
  inbox:processGarminInbox,publish:reconcileGarminPublications})(deadline);
}
