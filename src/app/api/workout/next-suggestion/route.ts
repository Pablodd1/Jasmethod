import { trainingAccess, errorResponse, ApiError } from "@/lib/access";
import { effectivePrescription } from "@/lib/effective-prescription";
import { prisma } from "@/lib/db";
import { loadStreams, prismaStreamRepo, streamStorageEnabled, type StreamDelegate } from "@/lib/activity-stream-store";
import { analyseStreams, type AnalysisSport } from "@/lib/stream-analysis";
import { evidencedTargetProfile } from "@/lib/anchor-evidence";
import { provenanceOf } from "@/lib/strava-provenance";
import { suggestNextWorkout } from "@/lib/next-workout-suggestion";
import { summarizeSet, toEditableSteps } from "@/lib/workout-interval-edit";
import { prescriptionSteps } from "@/lib/workout-history";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const NO_STORE = { "Cache-Control": "private, no-store" };
const WINDOW_DAYS = 7;

/**
 * GET ?id=<today's session> → a PROPOSED change for this session based on the athlete's most recent analysable
 * activity (≤ 7 days old). It only proposes: the athlete previews and confirms it through the interval-edit route,
 * and only this session's own check-in/safety gate (verdict "ready") lets that happen. Own data only: a coach
 * viewing an assigned athlete never receives an analysis of the athlete's second-by-second data.
 */
export async function GET(req: Request) {
  try {
    const { actor, athlete } = await trainingAccess(req);
    const id = new URL(req.url).searchParams.get("id");
    if (!id || id.length > 200) throw new ApiError("Select a workout.");
    const none = (reason: string) => Response.json({ suggestion: null, reason }, { headers: NO_STORE });
    if (actor.id !== athlete.id) return none("own_data_only");
    if (!streamStorageEnabled()) return none("storage_disabled");

    const resolved = await effectivePrescription(athlete.id, id);
    if (!resolved || resolved.canonical.verdict !== "ready" || !["run", "bike"].includes(resolved.canonical.sport)) return none("session_not_editable");
    const nextSet = summarizeSet(toEditableSteps(resolved.canonical.steps as any));

    const since = new Date(Date.now() - WINDOW_DAYS * 86_400_000);
    const recent = await prisma.workout.findMany({
      where: { userId: athlete.id, planned: false, completed: true, date: { gte: since, lte: new Date() } },
      orderBy: { date: "desc" }, take: 8,
      select: { id: true, title: true, date: true, sport: true, source: true, externalId: true, notes: true, matchedPlanId: true },
    });
    const repo = prismaStreamRepo((prisma as unknown as { activityStream: StreamDelegate }).activityStream);
    const [profile, applied] = await Promise.all([
      prisma.athleteProfile.findUnique({ where: { userId: athlete.id } }),
      prisma.auditLog.findMany({ where: { subjectId: athlete.id, action: "baseline.fromTest" }, orderBy: { createdAt: "desc" }, take: 100, select: { entityId: true } }),
    ]);
    const appliedIds = applied.flatMap((a: { entityId: string | null }) => (a.entityId ? [a.entityId] : []));
    const tests = await prisma.benchmarkTest.findMany({ where: { userId: athlete.id, id: { in: appliedIds }, completed: true, skipped: false }, orderBy: { date: "desc" } });
    const anchors = evidencedTargetProfile(profile, tests, appliedIds);

    for (const activity of recent) {
      const provenance = { source: activity.source, externalId: activity.externalId, notes: activity.notes };
      if (provenanceOf(provenance) !== "allowed") continue; // Strava-origin / unknown origin never feeds a suggestion
      const streams = await loadStreams(repo, athlete.id, activity.id);
      if (!streams) continue;
      const sport: AnalysisSport = ["bike", "run", "swim"].includes(activity.sport) ? (activity.sport as AnalysisSport) : "other";
      const analysis = analyseStreams({ streams, provenance, athlete: { ftpW: anchors.ftp ?? null, lthr: anchors.lthr ?? null }, sport });
      if (!analysis.ok) continue;
      let plannedSet = null;
      if (activity.matchedPlanId) {
        const plan = await prisma.workout.findFirst({ where: { id: activity.matchedPlanId, userId: athlete.id }, select: { prescription: true } });
        const steps = plan ? prescriptionSteps(plan.prescription) : null;
        plannedSet = steps ? summarizeSet(steps) : null;
      }
      const lang = athlete.language === "es" ? "es" : "en";
      const s = suggestNextWorkout({ analysis, plannedSet, nextSet });
      return Response.json({
        suggestion: { kind: s.kind, patch: s.patch ?? null, requiresConfirmation: s.requiresConfirmation, reasons: s.reasons.map(r => r[lang]) },
        basedOn: { activityId: activity.id, title: activity.title, date: activity.date },
      }, { headers: NO_STORE });
    }
    return none("no_recent_analysable_activity");
  } catch (error) {
    return errorResponse(error);
  }
}
