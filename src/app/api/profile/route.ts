export const dynamic = "force-dynamic";
import { trainingAccess, errorResponse } from "@/lib/access";
import { profilePatch } from "@/lib/profile-update";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import {
  estimateVo2max,
  estimateVo2maxFromHr,
  maxHrFromAge,
  estimateLthr,
  buildZoneTable,
} from "@/lib/science";

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
  if (!profile) return NextResponse.json({ profile: null, zones: null });

  const age = profile.birthYear
    ? new Date().getFullYear() - profile.birthYear
    : undefined;
  const hrMax = profile.maxHr ?? (age ? maxHrFromAge(age) : undefined);
  const lthr =
    profile.lthr ??
    (hrMax ? estimateLthr(hrMax, profile.experience) : undefined);
  const zones = buildZoneTable({
    maxHr: hrMax,
    lthr: lthr || undefined,
    ftp: profile.ftp || undefined,
    thresholdPaceSecPerKm: profile.runPaceBase || undefined,
    thresholdPaceSecPer100m: profile.swimPaceBase || undefined,
    restingHr: profile.restingHr || undefined,
  });

  // RHR-based VO2max estimate (Uth–Sørensen 2004: 15.3 × HRmax/HRrest) —
  // used ONLY when no test exists; a measured value is never replaced.
  // Needs a measured morning RHR; HRmax may be the Tanaka age estimate.
  const vo2maxEstimate = !profile.vo2max &&
    profile.restingHr &&
    hrMax
    ? estimateVo2maxFromHr(hrMax, profile.restingHr)
    : null;

  return NextResponse.json({
    profile,
    zones,
    age,
    hrMax,
    lthr,
    vo2max: profile.vo2max ?? vo2maxEstimate ?? null,
    vo2maxSource: profile.vo2max
      ? "lab/measured"
      : vo2maxEstimate
        ? "rhr-formula (Uth–Sørensen 2004)"
        : null,
    provenance: {
      lthr: profile.lthr ? "saved baseline" : lthr ? "estimated (HRmax-based)" : "unknown",
      maxHr: profile.maxHr
        ? "saved baseline"
        : hrMax
          ? "age estimate (Tanaka 2001)"
          : "unknown",
      vo2max: profile.vo2max
        ? "measured"
        : vo2maxEstimate
          ? "estimated from resting HR"
          : "unknown",
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
    const data = profilePatch(body, athlete.timezone);
    const profile = await prisma.$transaction(async (tx) => {
      const before = await tx.athleteProfile.findUnique({
        where: { userId: athlete.id },
      });
      const result = await tx.athleteProfile.upsert({
        where: { userId: athlete.id },
        create: { userId: athlete.id, ...data },
        update: data,
      });
      await tx.auditLog.create({
        data: {
          actorId: actor.id,
          subjectId: athlete.id,
          action: "profile.update",
          entityId: result.id,
          before: JSON.stringify(before),
          after: JSON.stringify(result),
        },
      });
      return result;
    });
    return NextResponse.json({ ok: true, profile });
  } catch (e) {
    return errorResponse(e);
  }
}
