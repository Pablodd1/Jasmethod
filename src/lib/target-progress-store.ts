import { createHash } from "node:crypto";
import { prisma } from "./db";
import { readPlanningSetup } from "./planning-setup-store";
import { assessPlanningSetup } from "./planning-setup";
import { parsePlanningTarget } from "./planning-target";
import { buildTargetProgress, parseProgressReport, type ProgressObservation, type ProgressSource } from "./target-progress";

export const TARGET_MEASUREMENT_ACTION = "target.measurement";
type ProgressDb = Pick<typeof prisma,"auditLog"|"benchmarkTest"|"athleteProfile">;
export function targetProgressRevision(data: unknown) { return createHash("sha256").update(JSON.stringify(data)).digest("hex"); }
export async function readTargetProgress(athlete: {id:string;timezone:string}, db: ProgressDb = prisma, now = new Date()) {
  const [setupState,profile,tests,audits] = await Promise.all([
    readPlanningSetup(athlete.id,db),
    db.athleteProfile.findUnique({where:{userId:athlete.id}}),
    db.benchmarkTest.findMany({where:{userId:athlete.id,completed:true},orderBy:[{date:"desc"},{id:"desc"}]}),
    db.auditLog.findMany({where:{subjectId:athlete.id,action:{in:["benchmark.record",TARGET_MEASUREMENT_ACTION]}},orderBy:[{createdAt:"asc"},{id:"asc"}],select:{id:true,entityId:true,action:true,after:true,actorId:true,createdAt:true}}),
  ]);
  const benchmarkSources = new Map(audits.filter(a=>a.action==="benchmark.record"&&a.entityId).map(a=>[a.entityId!,{source:(a.actorId===athlete.id?"athlete_reported":"coach_entered") as ProgressSource,enteredAt:a.createdAt.toISOString()}]));
  const reports: ProgressObservation[] = [];
  let unreadableReportCount = 0;
  for (const audit of audits.filter(a=>a.action===TARGET_MEASUREMENT_ACTION)) {
    try {
      const stored=JSON.parse(audit.after ?? "null");
      if (stored?.version!=="target-report-v1") throw Error("Unsupported report");
      const target=parsePlanningTarget(stored.targetAtEntry,now,athlete.timezone,true);
      // Revalidate stored data and immutable original context; do not silently
      // reinterpret earlier results when the athlete changes their goal.
      const report=parseProgressReport({...stored.report,contextConfirmed:true},target,now,athlete.timezone);
      reports.push({...report,id:audit.id,enteredAt:audit.createdAt.toISOString(),source:audit.actorId===athlete.id?"athlete_reported":"coach_entered"});
    } catch { unreadableReportCount++; }
  }
  const progress=buildTargetProgress({target:setupState.setup?.targetGoal??null,targetSource:setupState.setup?.source??null,targetSavedAt:setupState.setup?.confirmedAt??null,planningWeeks:setupState.setup?.planWeeks??null,benchmarks:tests.map(t=>({...t,...benchmarkSources.get(t.id)})),reports,now,timezone:athlete.timezone});
  if (unreadableReportCount) progress.limitations.push(`${unreadableReportCount} saved report(s) could not be validated and were excluded. No replacement result was invented.`);
  const planningReadiness=assessPlanningSetup(profile,setupState.setup,now);
  const revision=targetProgressRevision({setupRevision:setupState.revision,tests,audits,progress,planningReadiness});
  return {progress,revision,setupRevision:setupState.revision,planningReadiness,reports};
}
