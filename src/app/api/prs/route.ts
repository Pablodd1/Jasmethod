import { readManualPersonalBests } from "@/lib/onboarding-evidence";
import { profileRevision, saveProfile } from "@/lib/profile-service";
import { ApiError, errorResponse } from "@/lib/access";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { personalRecordEntry, type RecordDraft } from "@/lib/personal-record-entry";
import { dateKey } from "@/lib/dates";

// GET /api/prs — recorded activity results and separately reported personal marks.
// Whole-activity matches are not verified race results or fastest segment efforts.
export async function GET() {
  const user = await getCurrentUser();
  if (!user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const [storedWorkouts, profile] = await Promise.all([prisma.workout.findMany({
    where: { userId: user.id, completed: true, source: { not: "plan" } }, // imported + manual, skip plan seeds
    orderBy: { date: "desc" },
    select: {
      date: true,
      sport: true,
      title: true,
      durationMin: true,
      actualDurationMin: true,
      actualSport: true,
      planned: true,
      distanceKm: true,
      avgHr: true,
      avgPower: true,
      maxHr: true,
      source: true,
    },
  }), prisma.athleteProfile.findUnique({where:{userId:user.id}})]);
  // A completed planned duration is not an actual result. Only explicit actuals
  // or a completed unplanned activity establish recorded time.
  const workouts = storedWorkouts.flatMap(w=>{
    // Planned distance/power and a substituted sport are not corroborated
    // actual measurements. Keep those records out of automatic distance PRs.
    if(w.planned !== false || (w.actualSport && w.actualSport !== w.sport)) return [];
    const minutes = w.actualDurationMin ?? (w.planned === false ? w.durationMin : null);
    return typeof minutes === "number" && Number.isFinite(minutes) && minutes > 0 && minutes <= 1440
      ? [{...w,sport:w.actualSport || w.sport,durationMin:minutes}] : [];
  });
  const savedManual = readManualPersonalBests(profile?.manualPrs);
  // Do not turn malformed stored records into an editable empty replacement.
  const manualReviewRequired = savedManual === null || savedManual.some(record => record.value <= 0 || !record.unit.trim());
  const manual = savedManual ?? [];

  if (workouts.length === 0) {
    return NextResponse.json({
      prs: [],
      races: [],
      manual,
      manualReviewRequired,
      revision: profileRevision(profile),
      total: 0,
      message:
        "No completed workouts are stored yet. Saved manual personal bests are shown below. Import supported activities to review recorded results.",
    });
  }

  // ---- Distance-based PRs (running + cycling + swimming) ----
  const RUN_DISTANCES = [1, 5, 10, 21.0975, 42.195];
  const BIKE_DISTANCES = [10, 40, 90, 180];
  const SWIM_DISTANCES = [0.75, 1.5, 3.8];

  function bestTimeFor(
    sport: string,
    targetKm: number,
  ): { date: Date; minutes: number; title: string; paceSecKm: number; source: string; distanceKm: number } | null {
    let best: {
      date: Date;
      minutes: number;
      title: string;
      paceSecKm: number;
      source: string;
      distanceKm: number;
    } | null = null;
    for (const w of workouts) {
      if (
        w.sport !== sport ||
        !w.distanceKm ||
        w.distanceKm < targetKm ||
        w.distanceKm > targetKm * 1.01
      )
        continue;
      // Preserve the whole activity's actual time; never extrapolate an exact-distance PR.
      const minutes = w.durationMin; // actual total for an activity covering this distance
      const paceSecKm = (w.durationMin * 60) / w.distanceKm;
      if (!best || minutes < best.minutes)
        best = { date: w.date, minutes, title: w.title, paceSecKm, source:w.source || "unknown", distanceKm:w.distanceKm };
    }
    return best;
  }

  const prs: any[] = [];
  for (const d of RUN_DISTANCES) {
    const b = bestTimeFor("run", d);
    if (b)
      prs.push({
        sport: "run",
        label: `${d === 21.0975 ? "Half" : d === 42.195 ? "Marathon" : `${d}K`} Run recorded activity time`,
        source:b.source,
        minutes: b.minutes,
        paceSecKm: Math.round(b.paceSecKm),
        date: b.date,
        title: b.title,
      });
  }
  for (const d of BIKE_DISTANCES) {
    const b = bestTimeFor("bike", d);
    if (b)
      prs.push({
        sport: "bike",
        label: `${d}K Bike recorded activity time`,
        source:b.source,
        minutes: b.minutes,
        avgSpeedKmh: Math.round((b.distanceKm / (b.minutes / 60)) * 10) / 10,
        date: b.date,
        title: b.title,
      });
  }
  for (const d of SWIM_DISTANCES) {
    const b = bestTimeFor("swim", d);
    if (b)
      prs.push({
        sport: "swim",
        label: `${d === 0.75 ? "750m" : d === 1.5 ? "1500m" : "3.8km"} Swim recorded activity time`,
        source:b.source,
        minutes: b.minutes,
        paceSec100m: Math.round(b.paceSecKm / 10),
        date: b.date,
        title: b.title,
      });
  }

  // ---- Best power output (bike) ----
  const bestPower = workouts
    .filter((w) => w.sport === "bike" && typeof w.avgPower === "number" && Number.isFinite(w.avgPower) && w.avgPower > 0)
    .sort((a, b) => (b.avgPower || 0) - (a.avgPower || 0))[0];
  if (bestPower)
    prs.push({
      sport: "bike",
      label: "Best Avg Power",
      watts: bestPower.avgPower,
      source:bestPower.source,
      date: bestPower.date,
      title: bestPower.title,
    });

  // ---- Max distance in one session ----
  const longest = workouts
    .filter((w) => typeof w.distanceKm === "number" && Number.isFinite(w.distanceKm) && w.distanceKm > 0)
    .sort((a, b) => (b.distanceKm || 0) - (a.distanceKm || 0))[0];
  if (longest)
    prs.push({
      sport: longest.sport,
      label: "Longest Session",
      km: Math.round((longest.distanceKm || 0) * 10) / 10,
      source:longest.source,
      date: longest.date,
      title: longest.title,
    });

  // ---- Races: workouts whose title/type looks like a race ----
  const raceKw =
    /race|marathon|70\.3|tri|ironman|5k|10k|half|sprint|olympic|duathlon/i;
  const races = workouts
    .filter((w) => raceKw.test(w.title) || raceKw.test(w.sport))
    .slice(0, 20)
    .map((w) => ({
      date: w.date,
      sport: w.sport,
      title: w.title,
      durationMin: w.durationMin,
      distanceKm: w.distanceKm,
      avgHr: w.avgHr,
      avgPower: w.avgPower,
    }));

  return NextResponse.json({ prs:prs.map(record=>({...record,observedAt:record.date,date:dateKey(record.date,user.timezone)})), races, manual, manualReviewRequired, revision: profileRevision(profile), total: prs.length });
}

// PUT /api/prs — replace the athlete's manual personal records.
// Body: { manual: [{ label, value, unit, date }] }. Manual PRs cover times
// devices can't capture (track PBs, gym marks, field tests done by hand).
export async function PUT(req: Request) {
  const user = await getCurrentUser();
  if (!user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const body: unknown = await req.json().catch(() => { throw new ApiError("Invalid personal best request"); });
    if (!body || typeof body !== "object" || Array.isArray(body) || !("manual" in body) || !Array.isArray(body.manual)) throw new ApiError("Supply the personal records you reviewed before saving");
    const manual = readManualPersonalBests(body.manual);
    if (!manual || manual.some(row => row.value <= 0 || !row.unit.trim())) throw new ApiError("Each personal best needs a label, positive result and units (maximum 50)");
    if ("recordDraft" in body) {
      let record;
      try { record = personalRecordEntry(body.recordDraft as RecordDraft,dateKey(new Date(),user.timezone)); }
      catch(error){throw new ApiError((error as Error).message);}
      const last = manual.at(-1);
      if (!last || ["label","value","unit","date"].some(key=>(last as any)[key] !== (record as any)[key])) throw new ApiError("The reviewed result does not match the submitted record.");
      if (manual.slice(0,-1).some(row=>row.label===record.label&&row.value===record.value&&row.unit===record.unit&&row.date===record.date)) throw new ApiError("This result is already saved.",409);
    }
    const profile = await saveProfile(user.id, user, {
      expectedRevision: "expectedRevision" in body ? body.expectedRevision : undefined,
      manualPrs: JSON.stringify(manual),
    });
    return NextResponse.json({ ok: true, manual, revision: profileRevision(profile) });
  } catch (error) {
    return errorResponse(error);
  }
}
