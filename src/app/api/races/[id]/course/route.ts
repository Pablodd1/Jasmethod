import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { parseGpxCourse } from "@/lib/gpx";
import { rateLimit } from "@/lib/ratelimit";

export const dynamic = "force-dynamic";

// POST /api/races/[id]/course — attach a GPX course file to a race.
// Body: { gpx: "<xml string>" } (or raw text/xml body). Owner-only.
// Extracts measured distance (km) and total ascent (m); the forecast engine
// and race views read these instead of the distance-label guess.
export async function POST(
  req: Request,
  { params }: { params: { id: string } },
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!rateLimit(`gpx:${user.id}`, 10, 60000).ok)
    return NextResponse.json({ error: "Please wait a moment." }, { status: 429 });
  const race = await prisma.race.findFirst({
    where: { id: params.id, userId: user.id },
  });
  if (!race) return NextResponse.json({ error: "Race not found" }, { status: 404 });
  try {
    const ct = req.headers.get("content-type") || "";
    let xml = "";
    if (ct.includes("application/json")) {
      const b = await req.json();
      xml = String(b?.gpx || "");
    } else {
      xml = await req.text();
    }
    if (!xml.includes("<gpx"))
      return NextResponse.json({ error: "Not a GPX file" }, { status: 400 });
    const course = parseGpxCourse(xml);
    if (!course)
      return NextResponse.json(
        { error: "Could not read track points — is this a course GPX with a <trk>?" },
        { status: 400 },
      );
    await prisma.race.update({
      where: { id: race.id },
      data: { courseKm: course.km, courseElevM: course.elevM },
    });
    return NextResponse.json({
      ok: true,
      courseKm: course.km,
      courseElevM: course.elevM,
      points: course.points,
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: String(e?.message || "GPX parse failed").slice(0, 200) },
      { status: 500 },
    );
  }
}

// GET — current measured course summary
export async function GET(
  _req: Request,
  { params }: { params: { id: string } },
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const race = await prisma.race.findFirst({
    where: { id: params.id, userId: user.id },
    select: { name: true, courseKm: true, courseElevM: true },
  });
  if (!race) return NextResponse.json({ error: "Race not found" }, { status: 404 });
  return NextResponse.json({ ok: true, ...race });
}
