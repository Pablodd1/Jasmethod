import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { loadStreams, prismaStreamRepo, streamStorageEnabled, type StreamDelegate } from "@/lib/activity-stream-store";
import { analyseStreams, type AnalysisSport } from "@/lib/stream-analysis";
import { provenanceOf } from "@/lib/strava-provenance";
import { evidencedTargetProfile } from "@/lib/anchor-evidence";
import { readSportHeartRate, type SportHrSport } from "@/lib/sport-heart-rate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const NO_STORE = { "Cache-Control": "private, no-store" };

/**
 * GET ?workoutId=… → deterministic analysis of ONE of the athlete's own imported activities (stream-analysis.ts).
 * Own data only. Refuses (200, ok:false with a reason) for Strava-origin / unknown-origin activities before any
 * stored data is read. Anchors are the athlete's validated FTP only (same evidence rule as plan targets);
 * HR analysis requires a dated sport-specific athlete report valid on the activity date.
 */
export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const workoutId = new URL(req.url).searchParams.get("workoutId");
  if (!workoutId || workoutId.length > 200) return NextResponse.json({ error: "Select an activity." }, { status: 400 });
  try {
    const workout = await prisma.workout.findFirst({ where: { id: workoutId, userId: user.id }, select: { id: true, sport: true, source: true, externalId: true, notes: true, date: true, title: true } });
    if (!workout) return NextResponse.json({ error: "Activity not found" }, { status: 404 });
    const provenance = { source: workout.source, externalId: workout.externalId, notes: workout.notes };
    // Origin is decided first and independently of whether streams exist.
    if (provenanceOf(provenance) !== "allowed") return NextResponse.json(analyseStreams({ streams: null, provenance }), { headers: NO_STORE });
    if (!streamStorageEnabled()) return NextResponse.json({ ok: false, reason: "storage_disabled", message: "Second-by-second storage is not enabled." }, { headers: NO_STORE });

    const streams = await loadStreams(prismaStreamRepo((prisma as unknown as { activityStream: StreamDelegate }).activityStream), user.id, workout.id);
    const [profile, applied] = await Promise.all([
      prisma.athleteProfile.findUnique({ where: { userId: user.id } }),
      prisma.auditLog.findMany({ where: { subjectId: user.id, action: "baseline.fromTest" }, orderBy: { createdAt: "desc" }, take: 100, select: { entityId: true } }),
    ]);
    const appliedIds = applied.flatMap((a: { entityId: string | null }) => (a.entityId ? [a.entityId] : []));
    const tests = await prisma.benchmarkTest.findMany({ where: { userId: user.id, id: { in: appliedIds }, completed: true, skipped: false }, orderBy: { date: "desc" } });
    const anchors = evidencedTargetProfile(profile, tests, appliedIds);
    const sport: AnalysisSport = ["bike", "run", "swim"].includes(workout.sport) ? (workout.sport as AnalysisSport) : "other";
    const hrReference=["run","bike"].includes(sport)?readSportHeartRate(profile?.manualPrs,sport as SportHrSport,"lthr",workout.date,user.timezone):null;
    const analysis = analyseStreams({ streams, provenance, athlete: { ftpW: sport === "bike" ? anchors.ftp ?? null : null, lthr: hrReference?.value??null }, sport });
    return NextResponse.json({ ...analysis, workout: { id: workout.id, title: workout.title, date: workout.date, sport: workout.sport }, anchors: { ftpW: sport === "bike" ? anchors.ftp ?? null : null, ftpBasis: sport === "bike" && anchors.ftp ? "validated test within 90 days" : null,heartRate:hrReference } }, { headers: NO_STORE });
  } catch (error) {
    console.error("activity analysis failed:", error instanceof Error ? error.message : "unknown");
    return NextResponse.json({ error: "Could not analyse this activity." }, { status: 500 });
  }
}
