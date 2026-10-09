import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { ONBOARDING_METRICS, onboardingObservations } from "@/lib/onboarding-imports";
import { importedWeightSuggestions } from "@/lib/profile-import-review";
export const dynamic = "force-dynamic";
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return Response.json({error:"Unauthorized"},{status:401});
  const now = new Date();
  const recent = {gte:new Date(now.getTime()-30*86400000),lte:now};
  const historyWhere = {userId:user.id,planned:false,completed:true,externalId:{not:null},source:{notIn:["manual","plan"]}};
  const [rows, weights, connectors, totals, sports] = await Promise.all([
    prisma.metricObservation.findMany({
      where:{userId:user.id,metricType:{in:ONBOARDING_METRICS},observedAt:recent,qualityFlag:"ok"},
      select:{id:true,metricType:true,value:true,unit:true,source:true,observedAt:true,qualityFlag:true},
      orderBy:{observedAt:"desc"},take:500,
    }),
    prisma.metricObservation.findMany({
      where:{userId:user.id,metricType:"weight_kg",observedAt:recent,qualityFlag:"ok"},
      select:{id:true,value:true,unit:true,source:true,observedAt:true,qualityFlag:true,measurementMethod:true},
      orderBy:{observedAt:"desc"},take:100,
    }),
    prisma.connector.findMany({where:{userId:user.id},select:{provider:true,status:true,lastSyncAt:true,lastSyncCount:true}}),
    prisma.workout.aggregate({where:historyWhere,_count:{_all:true},_min:{date:true},_max:{date:true}}),
    prisma.workout.groupBy({by:["sport"],where:historyWhere,_count:{_all:true},orderBy:{sport:"asc"}}),
  ]);
  return Response.json({
    observations:onboardingObservations(rows,now),
    suggestions:importedWeightSuggestions(weights,connectors.filter(c=>c.status==="connected"||c.status==="error").map(c=>c.provider),now),
    history:{count:totals._count._all,earliestAt:totals._min.date?.toISOString()??null,latestAt:totals._max.date?.toISOString()??null,sports:sports.map(s=>({sport:s.sport,count:s._count._all}))},
    connectors,
    limitations:[
      "History describes completed imported records currently stored in JMM, not all records a provider may hold. A connection alone does not confirm a completed import.",
      "Weight suggestions require your confirmation. Strava profile weight is reported, not a device measurement; its date is when JMM retrieved it, not when it was weighed.",
      "Name, sex, age and height are not automatically imported here. Missing values and training anchors are not inferred from activity history.",
      "Only recent, usable weight observations from currently connected sources or your uploaded Apple Health file are suggested. File values are not independently verified measurements. Incomplete or suspect records are excluded.",
    ],
  },{headers:{"Cache-Control":"private, no-store"}});
}
