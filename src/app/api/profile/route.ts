import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { estimateVo2max, maxHrFromAge, estimateLthr, buildZoneTable } from "@/lib/science";

// GET /api/profile — user profile + zones
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const profile = await prisma.athleteProfile.findUnique({ where: { userId: user.id } });
  if (!profile) return NextResponse.json({ profile: null, zones: null });

  const age = profile.birthYear ? new Date().getFullYear() - profile.birthYear : undefined;
  const hrMax = profile.maxHr ?? (age ? maxHrFromAge(age) : undefined);
  const lthr = profile.lthr ?? (hrMax ? estimateLthr(hrMax, profile.experience) : undefined);
  const zones = lthr
    ? buildZoneTable({
        lthr,
        ftp: profile.ftp || undefined,
        thresholdPaceSecPerKm: profile.runPaceBase || undefined,
        thresholdPaceSecPer100m: profile.swimPaceBase || undefined,
      })
    : null;

  return NextResponse.json({ profile, zones, age, hrMax, lthr });
}

// PUT /api/profile — update athlete profile
export async function PUT(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const body = await req.json();
    const allowed = [
      "birthYear", "sex", "heightCm", "weightKg", "experience", "goal", "raceDate",
      "weeklyHours", "vo2max", "lthr", "restingHr", "maxHr", "ftp", "cp", "wPrime",
      "swimPaceBase", "runPaceBase", "hrvBaseline", "injured", "notes",
    ];
    const data: Record<string, any> = {};
    for (const key of allowed) {
      if (body[key] !== undefined) data[key] = body[key];
    }
    // If VO2max provided and LTHR missing, estimate LTHR from it
    if (data.vo2max && !data.lthr) {
      const age = data.birthYear ? new Date().getFullYear() - data.birthYear : 35;
      const hrMax = data.maxHr ?? maxHrFromAge(age);
      data.lthr = estimateLthr(hrMax, data.experience || "amateur");
    }
    const profile = await prisma.athleteProfile.upsert({
      where: { userId: user.id },
      create: { userId: user.id, ...data },
      update: data,
    });
    return NextResponse.json({ ok: true, profile });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "Update failed" }, { status: 500 });
  }
}
