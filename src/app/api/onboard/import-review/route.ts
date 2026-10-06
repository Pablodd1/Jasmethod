import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { ONBOARDING_METRICS, onboardingObservations } from "@/lib/onboarding-imports";
export const dynamic = "force-dynamic";
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return Response.json({error:"Unauthorized"},{status:401});
  const now = new Date();
  const rows = await prisma.metricObservation.findMany({
    where:{userId:user.id,metricType:{in:ONBOARDING_METRICS},observedAt:{gte:new Date(now.getTime()-30*86400000),lte:now},qualityFlag:"ok"},
    select:{id:true,metricType:true,value:true,unit:true,source:true,observedAt:true,qualityFlag:true},
    orderBy:{observedAt:"desc"},take:500,
  });
  return Response.json({observations:onboardingObservations(rows,now)},{headers:{"Cache-Control":"private, no-store"}});
}
