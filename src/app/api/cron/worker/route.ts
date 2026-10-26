import { runSyncJobs } from "@/lib/background-jobs";
import { prisma } from "@/lib/db";
import { cleanupActivityStreams } from "@/lib/activity-stream-cleanup";
export const dynamic="force-dynamic";
export const maxDuration=300;
export async function GET(req:Request) {
  if(!process.env.CRON_SECRET)return Response.json({error:"Worker not configured"},{status:503});
  if(req.headers.get("authorization")!==`Bearer ${process.env.CRON_SECRET}`)return Response.json({error:"Unauthorized"},{status:401});
  const [jobs, manualEmail, streamCleanup, garmin] = await Promise.all([runSyncJobs(), import("@/lib/manual-workout-email-service").then(m => m.reconcileManualWorkoutEmails()), cleanupActivityStreams(prisma.activityStream), import("@/lib/garmin-jobs").then(m => m.runGarminJobs())]);
  return Response.json({ jobs, manualEmail, streamCleanup, garmin }, { status: streamCleanup.status === "failed" ? 503 : 200 });
}
