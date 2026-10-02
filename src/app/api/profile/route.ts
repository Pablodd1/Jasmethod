import { readPlanningSetup } from "@/lib/planning-setup-store";
import { assessPlanningSetup } from "@/lib/planning-setup";
export const dynamic = "force-dynamic";
import { trainingAccess, errorResponse } from "@/lib/access";
import { saveProfile, profileRevision } from "@/lib/profile-service";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { buildZoneTable } from "@/lib/science";

// GET /api/profile — user profile + zones
export async function GET(req: Request) {
  let user;
  try {
    user = (await trainingAccess(req)).athlete;
  } catch (e) {
    return errorResponse(e);
  }
  if (!user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const profile = await prisma.athleteProfile.findUnique({
    where: { userId: user.id },
  });
  const {setup, revision: setupRevision} = await readPlanningSetup(user.id);
  const planningReadiness = assessPlanningSetup(profile, setup);
  if (!profile) return NextResponse.json({ profile: null, zones: null, revision: profileRevision(null), setup, setupRevision, planningReadiness });

  const age = profile.birthYear
    ? new Date().getFullYear() - profile.birthYear
    : undefined;
  // Saved anchors remain reported references; age/sex/weight do not establish capacity.
  const hrMax = profile.maxHr ?? undefined;
  const lthr = profile.lthr ?? undefined;
  const zones = buildZoneTable({
    maxHr: hrMax,
    lthr: lthr || undefined,
    ftp: profile.ftp || undefined,
    thresholdPaceSecPerKm: profile.runPaceBase || undefined,
    thresholdPaceSecPer100m: profile.swimPaceBase || undefined,
    restingHr: profile.restingHr || undefined,
  });

  return NextResponse.json({
    profile, setup, setupRevision, planningReadiness,
    revision: profileRevision(profile),
    zones,
    age,
    hrMax,
    lthr,
    vo2max: profile.vo2max ?? null,
    vo2maxSource: profile.vo2max ? "saved reference; provenance unverified" : null,
    provenance: {
      lthr: profile.lthr ? "saved reference; date/source unverified" : "unknown",
      maxHr: profile.maxHr ? "saved reference; date/source unverified" : "unknown",
      vo2max: profile.vo2max ? "saved reference; date/source unverified" : "unknown",
    },
    needsTesting: {
      vo2max: !profile.vo2max,
      lthr: !profile.lthr,
    },
  });
}

// PUT /api/profile — update athlete profile
export async function PUT(req: Request) {
  try {
    const { actor, athlete } = await trainingAccess(req);
    const body = await req.json();
    const profile = await saveProfile(actor.id, athlete, body);
    const setupState = await readPlanningSetup(athlete.id);
    return NextResponse.json({ ok: true, profile, revision: profileRevision(profile), setup: setupState.setup, setupRevision: setupState.revision, planningReadiness: assessPlanningSetup(profile, setupState.setup) });
  } catch (e) {
    return errorResponse(e);
  }
}
