import { cycleActivityEvidence, shapeTrainingCycle, TRAINING_CYCLE_VERSION } from "@/lib/training-cycle";
import { evidencedTargetProfile } from "@/lib/anchor-evidence";
import { setupNumber } from "@/lib/planning-target";
import { type BoundedPlanSession, boundPlanWeeks } from "@/lib/planning-bounds";
import { DOUBLE_DAY_VERSION, doubleDayTiming } from "@/lib/double-day";
import { createHash, randomUUID } from "node:crypto";
import { assessPlanningSetup, planningGoal } from "@/lib/planning-setup";
import { readPlanningSetup } from "@/lib/planning-setup-store";
import { profileRevision } from "@/lib/profile-service";
import { trainingAccess, errorResponse, ApiError } from "@/lib/access";
import {
  dayBounds,
  dateKey,
  parseDate,
  addDaysKey,
  localDate,
} from "@/lib/dates";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import {
  generatePlan,
  generateHyroxPlan,
  generateSingleSport,
  buildZoneTable,
  type ZoneTable,
  type PlanSession,
  generateTrackSprint,
} from "@/lib/science";
import {
  recoveryFor,
  scheduleTests,
  venueAdjustment,
  defaultStartTime,
  prescribeToday,
} from "@/lib/adaptive";

// POST /api/plan/generate — generate a periodized plan for the user
export async function POST(req: Request) {
  let user, actor;
  try {
    const access = await trainingAccess(req);
    user = access.athlete;
    actor = access.actor;
  } catch (e) {
    return errorResponse(e);
  }
  if (!user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const body = await req.json();
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new ApiError("Invalid plan body");
    const {
      distance,
      weeks,
      startDate,
      raceDate,
      targetTempC,
      easyPct,
      trainingWindow,
    } = body || {};
    let splitTarget: number;
    let weeksCount: number;
    try { splitTarget = easyPct == null ? 70 : setupNumber(easyPct,"easy percentage",45,90); }
    catch(e) { throw new ApiError((e as Error).message); }
    const profile = user.profile ?? await prisma.athleteProfile.findUnique({where:{userId:user.id}});
    const setupState = await readPlanningSetup(user.id);
    const readiness = assessPlanningSetup(profile, setupState.setup);
    if (!profile || !readiness.ready || !setupState.setup) return NextResponse.json({error: "Complete and review your setup before generating an individual plan.", ...readiness}, {status: 422});
    const setup = setupState.setup;
    if(setup.doubleDay?.athleteAgreed && (actor.id!==user.id||setup.source!=="athlete_reported")) throw new ApiError("The athlete must review and confirm their own optional double-day plan.",403);
    const level = profile.experience;

    // Preferred training window: an explicit request wins, else the saved
    // profile preference, else "any" (no fixed time).
    const window = String(trainingWindow || profile.trainingWindow || "any");
    if (!["any","morning","midday","evening"].includes(window)) throw new ApiError("Choose a supported training window");
    const sessionStartTime = defaultStartTime(window);

    // No demographic physiology estimates enter an individual training decision.
    const vo2max = profile.vo2max;
    const lthr = profile.lthr ?? undefined;
    try { weeksCount = setupNumber(weeks ?? setup.planWeeks,"planning weeks",4,30); }
    catch(e) { throw new ApiError((e as Error).message); }
    if (!Number.isInteger(weeksCount) || weeksCount < 4 || weeksCount > 30) throw new ApiError("Choose a planning horizon of 4–30 weeks");
    // Parse date-only strings as LOCAL midnight (new Date("YYYY-MM-DD") is UTC,
    // which shifts every session a day off in EDT and breaks "today" lookups).
    const toLocalMidnight = (s: string) => parseDate(s, user.timezone);
    const start = startDate
      ? toLocalMidnight(String(startDate))
      : dayBounds(user.timezone).start;
    const startKey = dateKey(start, user.timezone);
    const todayKey = dayBounds(user.timezone).key;
    if (startKey < todayKey) throw new ApiError("Choose today or a future start date. Completed training history cannot be restarted.", 422);
    const dist = String(planningGoal(distance || profile.goal) || "");
    if (dist !== planningGoal(profile.goal)) throw new ApiError("Update and confirm your saved goal before previewing a different sport.",422);
    // All future races feed planning: the A race anchors the taper; B races
    // get train-through sharpening weeks (extraRaces below).
    const activityQuery = { where: { userId: user.id, date: { gte: localDate(addDaysKey(todayKey, -28), user.timezone), lt: localDate(addDaysKey(startKey, weeksCount * 7), user.timezone) }, OR: [{ completed: true }, { actualDurationMin: { not: null } }, { feedbackStatus: { not: null } }] }, orderBy: { id: "asc" as const }, select: { id: true, date: true, completed: true, actualDurationMin: true, feedbackStatus: true, rpe: true, matchedPlanId: true } };
    const benchmarkQuery = { where: { userId: user.id, completed: true, skipped: false }, orderBy: { id: "asc" as const }, select: { id: true, date: true, type: true, result: true, completed: true, skipped: true } };
    const anchorQuery = { where: { subjectId: user.id, action: "baseline.fromTest" }, orderBy: { id: "asc" as const }, select: { entityId: true } };
    const [storedRaces, recentActivity, benchmarkTests, appliedAnchors] = await Promise.all([prisma.race.findMany({
      where: { userId: user.id, date: { gte: new Date(`${startKey}T00:00:00Z`) } },
      orderBy: [{ priority: "asc" }, { date: "asc" }],
    }), prisma.workout.findMany(activityQuery), prisma.benchmarkTest.findMany(benchmarkQuery), prisma.auditLog.findMany(anchorQuery)]);
    // Race rows store the entered calendar day at UTC midnight, whereas profile
    // dates and explicit request dates use athlete-local midnight. Normalize only race rows.
    const allRaces = storedRaces.map(row => ({ ...row, date: toLocalMidnight(row.date.toISOString().slice(0,10)) }));
    const activityEvidence = cycleActivityEvidence(recentActivity, todayKey, user.timezone);
    const anchors = evidencedTargetProfile(profile, benchmarkTests, appliedAnchors.flatMap(row => row.entityId ? [row.entityId] : []));
    const needsAssessment = dist === "cycle" ? !anchors.ftp : dist === "swim-only" ? !anchors.swimPaceBase : ["track-sprint", "hyrox"].includes(dist) ? true : dist === "run-only" ? !anchors.runPaceBase : !anchors.ftp || !anchors.runPaceBase || !anchors.swimPaceBase;
    const anchorRaceId = (
      allRaces.find((r) => r.priority === 1) || allRaces[0]
    )?.id;
    // Taper anchor: explicit raceDate wins; else the athlete's A race; else
    // a supplied profile date. Missing dates remain absent.
    const race = raceDate
      ? toLocalMidnight(String(raceDate))
      : allRaces.find((r) => r.id === anchorRaceId)?.date ??
        profile.raceDate ?? null;
    if (
      ![
        "sprint",
        "olympic",
        "half",
        "full",
        "hyrox",
        "track-sprint",
        "cycle",
        "run-only",
        "swim-only",
      ].includes(dist) ||
      !Number.isFinite(weeksCount)
    )
      throw new ApiError("Invalid plan parameters");
    const isHyrox = dist === "hyrox";

    const isTrackSprint = dist === "track-sprint";
    const isSingleSport =
      dist === "cycle" ||
      dist === "swim-only" ||
      dist === "run-only";
    const rawGenerated = isTrackSprint
      ? generateTrackSprint({ level, event: setup.trackEvent!, weeks: weeksCount, startDate: start })
      : isSingleSport
      ? generateSingleSport({
          sport:
            dist === "cycle"
              ? "bike"
              : dist === "swim-only"
                ? "swim"
                : "run",
          level,
          weeks: weeksCount,
          startDate: start,
          weeklyHours: profile.weeklyHours || undefined,
          hasRace: Boolean(race),
        })
      : isHyrox
          ? generateHyroxPlan({
              level,
              weeks: weeksCount,
              startDate: start,
              weeklyHours: profile.weeklyHours || undefined,
            })
          : generatePlan({
              level,
              distance: dist,
              weeks: weeksCount,
              startDate: start,
              weeklyHours: profile.weeklyHours || undefined,
              easyPct: splitTarget,
              // `race` already prefers the explicit date, then the athlete's
              // A race. Never synthesize a plan-end event date.
              raceDate: race ?? undefined,
              // B/C races: B races get train-through sharpening in their week;
              // the A race (raceDate above) anchors the taper. Excludes the
              // anchor itself to avoid double-counting the same date.
              extraRaces: allRaces
                .filter((r) => r.id !== anchorRaceId && r.date > start)
                .map((r) => ({ date: r.date, priority: r.priority })),
            });

    if (race && race <= start) throw new ApiError("Race date must follow the plan start; update your actual event details.");
    if (race && race.getTime() - start.getTime() < 28 * 86400000) throw new ApiError("This short event horizon needs a reviewed preparation plan; automatic progression cannot promise the requested result.");
    // Preserve actual day placement, reducing rather than making up omitted work.
    const startWeekday = new Date(dateKey(start,user.timezone)+"T12:00Z").getUTCDay();
    const pairSlot=setup.doubleDay ? (setup.doubleDay.weekday-startWeekday+7)%7 : 0;
    const raceDays=[...allRaces.map(r=>dateKey(r.date,user.timezone)),...(race?[dateKey(race,user.timezone)]:[])];
    const excludedDoubleWeeks=rawGenerated.flatMap((_,i)=>{
      const candidateDay=Date.parse(addDaysKey(dateKey(start,user.timezone),i*7+pairSlot));
      return raceDays.some(d=>Date.parse(d)-candidateDay>=0&&Date.parse(d)-candidateDay<=14*86400000)?[i]:[];
    });
    const {weeks: bounded, weeklyBudget, recoveryPolicy} = boundPlanWeeks(rawGenerated, setup, profile.weeklyHours, startWeekday, level, excludedDoubleWeeks);
    const structuredDraft = (session: BoundedPlanSession) => ({ ...prescribeToday({ session: { cycleVersion:TRAINING_CYCLE_VERSION, title:session.title, sport:session.sport, type:session.type, intensity:session.zone, durationMin:session.minutes, description:session.description, startTime:session.startTime ?? sessionStartTime }, adaptation: { verdict:"planned", durationFactor:1, intensityCap:session.zone } }), planningStatus: "provisional", planningNote:session.description });
    const generated = shapeTrainingCycle(bounded, { startKey, raceKey: race ? dateKey(race, user.timezone) : null, needsAssessment, recoveryReview: activityEvidence.recoveryReview, protectedDays: activityEvidence.protectedDays }).map(week => ({ ...week, sessions: week.sessions.map(session => ({ ...session, steps: structuredDraft(session).steps })) }));
    const baselineEvidence = [
      { label:"Cycling power", value:profile.ftp, source:anchors.ftp ? "measured_test" : profile.ftp ? "unverified_profile_reference" : "unavailable" },
      { label:"Running threshold pace", value:profile.runPaceBase, source:anchors.runPaceBase ? "estimated_from_5k_test" : profile.runPaceBase ? "unverified_profile_reference" : "unavailable" },
      { label:"Swimming CSS reference", value:profile.swimPaceBase, source:anchors.swimPaceBase ? "swim_field_test_reference" : profile.swimPaceBase ? "unverified_profile_reference" : "unavailable" },
    ];
    const assessmentScheduled = generated.some(week => week.sessions.some(session => session.title.includes("Comfortable baseline observation")));
    const assessmentNote = ["track-sprint", "hyrox"].includes(dist) ? " Sprint technique, maximal-speed ability and station competence are not established by a running threshold. Use only controlled familiar practice; sport-specific coaching review is required for maximal or loaded progression." : "";
    const cycle = { version: TRAINING_CYCLE_VERSION, baselineEvidence, goal: setup.goalDescription, target: setup.targetGoal, baseline: { weeklyMinutes: setup.baselineWeeklyMinutes, observedAt: setup.baselineObservedAt, source: setup.source }, assessment: needsAssessment ? (assessmentScheduled ? "A comfortable non-maximal baseline observation is included; no threshold or performance value is invented. Record actual effort and recovery, then review before progressing." : "A baseline observation does not fit the available sessions. Review sport-specific availability and recent tolerated training with your coach before progressing; no threshold or performance value is invented.") + assessmentNote : "Recent applied sport-specific test evidence is available. A test result does not guarantee recovery or future performance.", activity: activityEvidence, weeks: generated.map(week => ({ week: week.week, theme: week.theme, totalMinutes: week.totalMinutes, reviewNote: week.reviewNote })), evidenceNote: "Goal values are aspirations. Reported training, measured test results and derived estimates retain their source records. Session zones are effort labels; no new physiological estimate is created." };
    if (!generated.some(week=>week.sessions.length)) throw new ApiError("The current template does not fit your available days/time. A coach should review the schedule; no sessions were assigned.", 422);
    for(const [index,week] of generated.entries()) {
      const pair=week.sessions.filter(s=>s.doubleDayRole);
      if(pair.length) {
        try{doubleDayTiming(addDaysKey(dateKey(start,user.timezone),index*7+pair[0].daySlot),user.timezone,pair.map(s=>({startTime:s.startTime!,durationMin:s.minutes})));}
        catch(error){throw new ApiError((error as Error).message,422);}
      }
    }
    const doubleDayAgreementRequired=generated.some(w=>w.sessions.some(s=>s.doubleDayRole));
    const currentPlans = await prisma.trainingPlan.findMany({where: {userId: user.id, status: "active"}, orderBy: {id: "asc"}, select: {id:true}});
    const previewToken = createHash("sha256").update(JSON.stringify({ userId: user.id, profile: profileRevision(profile), setup: setupState.revision, plans: currentPlans, dist, weeksCount, start, race, splitTarget, window, generated, recentActivity, benchmarkTests, appliedAnchors })).digest("hex");
    if (body.preview === true) return NextResponse.json({ok:true, preview: {distance: dist, weeks:weeksCount, startDate:start, raceDate:race, weeklyBudgetMin:weeklyBudget, existingPlans:currentPlans.length, weeksPreview:generated, recoveryPolicy, cycle}, previewToken,
      planningBasis: setup.baselinePlanOptIn ? "baseline_only" : "baseline", targetReview: readiness.targetReview ?? [],
      doubleDayAgreementRequired,
      warning: "Numeric targets remain aspirations: this plan is not optimized or promised to reach them. Future sessions are provisional and bounded by reported recent training. Existing prescriptions and completed activity will be preserved. A goal is not a guaranteed outcome; daily safety checks still apply."});
    if(doubleDayAgreementRequired && (body.confirmDoubleDay!==true||actor.id!==user.id)) throw new ApiError("Review both sessions and times, then explicitly confirm the optional pairs as the athlete.",422);
    if (body.previewToken !== previewToken) throw new ApiError("Preview the current plan and confirm it before replacing future training.", 409);

    // Persist plan + plan days + planned workouts
    // Archive the previous plan and mark its uncompleted future rows superseded.
    // Original prescriptions and completed history remain retrievable.
    const plan = await prisma.$transaction(
      async (tx) => {
        const [latestProfile, latestSetup, latestActivity, latestBenchmarks, latestAnchors] = await Promise.all([
          tx.athleteProfile.findUnique({where:{userId:user.id}}),
          readPlanningSetup(user.id, tx),
          tx.workout.findMany(activityQuery), tx.benchmarkTest.findMany(benchmarkQuery), tx.auditLog.findMany(anchorQuery),
        ]);
        if (JSON.stringify([latestActivity, latestBenchmarks, latestAnchors]) !== JSON.stringify([recentActivity, benchmarkTests, appliedAnchors])) throw new ApiError("Your training history or baseline evidence changed. Review a fresh preview before saving.", 409);
        if(latestSetup.setup?.doubleDay?.athleteAgreed && (actor.id!==user.id||latestSetup.setup.source!=="athlete_reported")) throw new ApiError("Athlete agreement must be confirmed by the athlete.",403);
        if (profileRevision(latestProfile) !== profileRevision(profile) || latestSetup.revision !== setupState.revision) throw new ApiError("Your profile or setup changed. Review a new preview.", 409);
        const oldPlans = await tx.trainingPlan.findMany({
          where: { userId: user.id, status: "active" },
          orderBy: {id: "asc"},
          select: { id: true },
        });
        if (JSON.stringify(oldPlans) !== JSON.stringify(currentPlans)) throw new ApiError("Your active plan changed. Preview again before replacing it.", 409);
        if (oldPlans.length) {
          await tx.workout.updateMany({
            where: {
              userId: user.id,
              planned: true,
              completed: false,
              date: { gte: dayBounds(user.timezone).start },
              planDay: { planId: { in: oldPlans.map((p) => p.id) } },
            },
            data: {planned: false, source: "superseded-plan"},
          });
          await tx.trainingPlan.updateMany({
            where: { id: { in: oldPlans.map((p) => p.id) } },
            data: { status: "archived" },
          });
        }
        const plan = await tx.trainingPlan.create({
          data: {
            userId: user.id,
            name: `JMM ${dist} ${weeksCount}-week plan (${level})`,
            level,
            distance: dist,
            weeks: weeksCount,
            startDate: start,
            raceDate: race,
            easyPct: splitTarget,
            days: {
              create: generated.flatMap((week, wi) => {
                // Group the week's sessions onto 7 day-slots; sessions sharing a slot
                // (e.g. swim + recovery on Monday) join ONE PlanDay so dates never
                // duplicate and "Day off" applies to the whole day.
                const bySlot = new Map<number, BoundedPlanSession[]>();
                week.sessions.forEach((s) => {
                  const slot = s.daySlot;
                  if (!bySlot.has(slot)) bySlot.set(slot, []);
                  bySlot.get(slot)!.push(s);
                });
                // Save explicit off-days with no compulsory workout. This is
                // still only a prescription, never a completed-rest report.
                for (const slot of week.restDaySlots) bySlot.set(slot, []);
                return Array.from(bySlot.entries()).map(
                  ([slot, slotSessions]) => {
                    const date = localDate(
                      addDaysKey(dateKey(start, user.timezone), wi * 7 + slot),
                      user.timezone,
                    );
                    const rows=slotSessions.map(s=>({...s,id:randomUUID()}));
                    const pair=rows.filter(s=>s.doubleDayRole).map(s=>({id:s.id,sport:s.sport,type:s.type,intensity:s.zone,durationMin:s.minutes,startTime:s.startTime!}));
                    return {
                      date,
                      week: week.week,
                      dayOfWeek: new Date(
                        dateKey(date, user.timezone) + "T12:00Z",
                      ).getUTCDay(),
                      dayOff: slotSessions.length === 0,
                      focus: slotSessions[0]?.sport ?? "recovery",
                      notes: slotSessions[0]?.description ?? "Planned rest: no compulsory workout. Optional recovery is offered separately when appropriate; this does not confirm completed rest.",
                      sessions: {
                        create: rows.map((s) => ({
                          id:s.id,
                          userId: user.id,
                          date,
                          startTime: s.startTime ?? sessionStartTime,
                          originalPlan: JSON.stringify({ cycleVersion:TRAINING_CYCLE_VERSION, title:s.title, sport:s.sport, type:s.type, intensity:s.zone, durationMin:s.minutes, description:s.description, startTime:s.startTime ?? sessionStartTime, ...(s.doubleDayRole && pair.length===2 ? {doubleDay:{version:DOUBLE_DAY_VERSION,setupRevision:setupState.revision,dateLocal:dateKey(date,user.timezone),purpose:setup.doubleDay!.purpose,role:s.doubleDayRole,pair}} : {}) }),
                          prescription: JSON.stringify(structuredDraft(s)),
                          sport: s.sport,
                          title: s.title,
                          type: s.type,
                          durationMin: s.minutes,
                          intensity: s.zone,
                          notes: s.description,
                          rpe: null,
                          planned: true,
                          completed: false,
                          source: "plan",
                          recovery: recoveryFor(date).cooldownNote,
                        })),
                      },
                    };
                  },
                );
              }),
            },
          },
          include: { days: { include: { sessions: true } } },
        });

        await tx.auditLog.create({
          data: {
            actorId: actor.id,
            subjectId: user.id,
            action: "plan.generate",
            entityId: plan.id,
            after: JSON.stringify({
              name: plan.name,
              cycle,
              doubleDayAgreement: doubleDayAgreementRequired ? {version:DOUBLE_DAY_VERSION,confirmedBy:actor.id,setupRevision:setupState.revision,previewToken} : null,
              weeks: weeksCount,
              startDate: start, setupRule: readiness.ruleId, setupRevision: setupState.revision, previewToken, weeklyBudgetMin: weeklyBudget, recoveryPolicy, previousPlanIds: currentPlans.map(p => p.id),
            }),
          },
        });
        return plan;
      },
      { timeout: 30000, isolationLevel: "Serializable" },
    );

    // Also build the zone table for the user to see
    const zones: ZoneTable = buildZoneTable({
      maxHr: profile.maxHr ?? undefined,
      lthr,
      ftp: profile.ftp || undefined,
      thresholdPaceSecPerKm: profile.runPaceBase || undefined,
      thresholdPaceSecPer100m: profile.swimPaceBase || undefined,
      restingHr: profile.restingHr || undefined,
    });

    const scheduledTests: ReturnType<typeof scheduleTests> = [];

    // Race venue adjustment (temperature + elevation + terrain + water) from the A-race
    let venuePlan = null;
    const anchorRace = allRaces.find((r) => r.priority === 1) || allRaces[0];
    const temp =
      targetTempC !== undefined
        ? parseFloat(targetTempC)
        : (anchorRace?.targetTempC ?? undefined);
    if (anchorRace || temp !== undefined) {
      venuePlan = venueAdjustment({
        targetTempC: temp,
        humidity: anchorRace?.humidity ?? undefined,
        baseElevM: anchorRace?.baseElevM ?? undefined,
        bikeElevM: anchorRace?.bikeElevM ?? undefined,
        bikeTerrain: anchorRace?.bikeTerrain ?? undefined,
        runElevM: anchorRace?.runElevM ?? undefined,
        runTerrain: anchorRace?.runTerrain ?? undefined,
        swimVenue: anchorRace?.swimVenue ?? undefined,
        waterTempC: anchorRace?.waterTempC ?? undefined,
        swimCurrent: anchorRace?.swimCurrent ?? undefined,
      });
    }

    return NextResponse.json({
      ok: true,
      plannerVersion: TRAINING_CYCLE_VERSION,
      cycle,
      recoveryPolicy,
      plan: {
        id: plan.id,
        name: plan.name,
        level,
        distance: dist,
        weeks: weeksCount,
        startDate: start,
        raceDate: race,
        sessions: plan.days.flatMap((d) => d.sessions),
      },
      zones,
      physiology: { vo2max, lthr },
      benchmarks: scheduledTests,
      venuePlan,
    });
  } catch (e: any) {
    console.error("plan generate error:", e);
    return errorResponse(e);
  }
}
