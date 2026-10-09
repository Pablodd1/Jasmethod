import { runSyncJobs } from "@/lib/background-jobs";
export const dynamic="force-dynamic";
export const maxDuration=300;
export async function GET(req:Request) {
  if(!process.env.CRON_SECRET)return Response.json({error:"Worker not configured"},{status:503});
  if(req.headers.get("authorization")!==`Bearer ${process.env.CRON_SECRET}`)return Response.json({error:"Unauthorized"},{status:401});
  const [jobs, manualEmail] = await Promise.all([runSyncJobs(), import("@/lib/manual-workout-email-service").then(m => m.reconcileManualWorkoutEmails())]);
  return Response.json({ jobs, manualEmail });
}
