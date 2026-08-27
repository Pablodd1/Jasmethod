import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { gearAdvice, gearSources } from "@/lib/gear";
import { RESEARCH_SOURCES } from "@/lib/research";

export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const profile = await prisma.athleteProfile.findUnique({ where: { userId: user.id } });
  if (!profile) return NextResponse.json({ error: "no profile" }, { status: 404 });

  const advice = gearAdvice({
    bikeType: profile.bikeType || undefined,
    hasBikePowerMeter: profile.hasBikePowerMeter,
    hasRunPowerMeter: profile.hasRunPowerMeter,
    hasBikeComputer: profile.hasBikeComputer,
    hasAeroBars: profile.hasAeroBars,
    hasHrm: profile.hasHrm,
    hasGpsWatch: profile.hasGpsWatch,
    hasSwimPaceTool: profile.hasSwimPaceTool,
    hasSmartTrainer: profile.hasSmartTrainer,
    hasCadenceSensor: profile.hasCadenceSensor,
    raceDistance: profile.goal || undefined,
    ftp: profile.ftp,
    runPaceBase: profile.runPaceBase,
    swimPaceBase: profile.swimPaceBase,
    weeklyHours: profile.weeklyHours,
    experience: profile.experience,
  });

  const sources = gearSources(advice, RESEARCH_SOURCES);

  return NextResponse.json({
    advice,
    sources,
    profile: {
      bikeType: profile.bikeType,
      hasBikePowerMeter: profile.hasBikePowerMeter,
      hasRunPowerMeter: profile.hasRunPowerMeter,
      hasHrm: profile.hasHrm,
      hasGpsWatch: profile.hasGpsWatch,
      hasSwimPaceTool: profile.hasSwimPaceTool,
    },
  });
}

export async function PUT(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json();
  const allowed = [
    "bikeType", "hasBikePowerMeter", "hasRunPowerMeter", "hasBikeComputer",
    "hasAeroBars", "hasHrm", "hasGpsWatch", "hasSwimPaceTool", "hasSmartTrainer", "hasCadenceSensor",
  ];
  const data: Record<string, any> = {};
  for (const k of allowed) {
    if (k in body) data[k] = body[k];
  }
  if (Object.keys(data).length === 0) return NextResponse.json({ error: "no fields" }, { status: 400 });

  await prisma.athleteProfile.update({ where: { userId: user.id }, data });
  return NextResponse.json({ ok: true });
}
