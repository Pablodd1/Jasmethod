import test from "node:test";
import assert from "node:assert/strict";
import { existingReviewCandidate, confirmedExistingReview, EXISTING_REVIEW_VERSION } from "./existing-workout-review";
import { effectiveSessionFromRecords, type EffectiveRecords } from "./effective-prescription";
import { activityFingerprint, type ActivityDecision } from "./activity-evidence";
import { SUBJECTIVE_FIELDS } from "./checkin-safety";

const now = new Date("2026-10-21T12:00:00Z"), date = new Date("2026-10-21T00:00:00Z");
function workout(patch: Record<string, any> = {}) {
  return { id: "saved-easy", userId: "athlete", date, planned: true, completed: false, approved: false,
    sport: "bike", type: "endurance", intensity: "z2", title: "Saved easy ride", durationMin: 30,
    prescription: JSON.stringify({ sport: "bike", verdict: "full", durationMin: 30,
      steps: [{ name: "Easy", zone: "z2", phase: "active", seconds: 1800, target: { type: "open" } }] }), ...patch };
}
function candidate(patch: Record<string, any> = {}) {
  const w = patch.workout ?? workout();
  return existingReviewCandidate({ athleteId: "athlete", timezone: "UTC", now, workout: w,
    profile: { ftp: 200 }, maxDailyMinutes: 60, setupReady: true, sameDaySessions: [w],
    context: { setupRevision: "reviewed-setup" }, ...patch });
}
function answers(c = candidate()) {
  return { ...Object.fromEntries(SUBJECTIVE_FIELDS.map(f => [f, null])), sick: false, newPain: false,
    urgentSymptoms: false, availableMin: c.remainingPlanMinutes,
    inputMetadata: { version: EXISTING_REVIEW_VERSION, source: "athlete-confirmed-existing", recordedAt: now.toISOString(),
      existingReview: { version: EXISTING_REVIEW_VERSION, sessionId: c.sessionId, workoutRevision: c.workoutRevision,
        contextRevision: c.contextRevision, confirmedAt: now.toISOString(), noSymptoms: true,
        recoveryUnchanged: true, timeConfirmed: true, availableMin: c.remainingPlanMinutes } } };
}
function records(patch: Partial<EffectiveRecords> = {}): EffectiveRecords {
  const w = patch.workout ?? workout();
  return { userId: "athlete", timezone: "UTC", now, workout: w, profile: { ftp: 200 }, checkin: null,
    planning: { ready: true, missing: [], review: [], ruleId: "fixture" }, maxDailyMinutes: 60,
    currentPrescription: true, revisionContext: { sourceProfile: { ftp: 200 }, setupRevision: "reviewed-setup" },
    sameDaySessions: [w], ...patch };
}
function reviewed(input = records()): EffectiveRecords {
  const c = effectiveSessionFromRecords(input).existingReview;
  assert.equal(c.eligible, true, c.reason);
  return { ...input, checkin: { date, answers: JSON.stringify(answers(c)), adaptation: JSON.stringify({
    score: 0, scoreAvailable: false, verdict: "easy", durationFactor: 1, intensityCap: "z2", safetyStatus: "clear",
    ruleId: `${EXISTING_REVIEW_VERSION}:scoped`, missingFields: [...SUBJECTIVE_FIELDS] }) } };
}

test("short review is eligible only for the owned current-day unchanged timed easy plan", () => {
  const yes = candidate();
  assert.equal(yes.eligible, true); assert.equal(yes.minutes, 30); assert.equal(yes.remainingPlanMinutes, 30);
  for (const sport of ["run", "bike", "swim", "mobility", "recovery"]) {
    const w = workout({ sport, prescription: JSON.stringify({ sport, durationMin: 30, verdict: "full",
      steps: [{ name: "Easy", seconds: 1800, zone: "z1", phase: "active", target: { type: "open" } }] }) });
    assert.equal(candidate({ workout: w }).eligible, true, sport);
  }
  const hard = workout({ prescription: JSON.stringify({ durationMin: 30, verdict: "full", steps: [{ name: "Hard", seconds: 1800, zone: "z4", phase: "active" }] }) });
  const unknown = workout({ prescription: null });
  const untimed = workout({ prescription: JSON.stringify({ durationMin: 30, steps: [{ name: "Distance", seconds: 1800,
    endpoint: { type: "distance", meters: 10000 }, zone: "z2", phase: "active", target: { type: "open" } }] }) });
  const unknownTarget = workout({ prescription: JSON.stringify({ durationMin: 30, steps: [{ name: "Unanchored power", seconds: 1800,
    zone: "z2", phase: "active", target: { type: "power", low: 100, high: 120 } }] }) });
  for (const patch of [ { workout: hard }, { workout: unknown }, { workout: workout({ userId: "someone-else" }) },
    { workout: untimed }, { workout: unknownTarget, profile: {} },
    { workout: workout({ date: new Date("2026-10-20T00:00:00Z") }) }, { workout: workout({ planned: false }) },
    { workout: workout({ actualDurationMin: 0, rpe: 0 }) }, { setupReady: false }, { knownHold: true },
    { profile: { injured: true } }, { maxDailyMinutes: null }, { maxDailyMinutes: 29 },
    ...["race", "test", "speed", "plyo", "threshold", "interval", "tempo"].map(type => ({ workout: workout({ type }) })),
    ...["brick", "hyrox", "strength"].map(sport => ({ workout: workout({ sport }) })) ]) {
    assert.equal(candidate(patch).eligible, false, JSON.stringify(patch));
  }
  assert.equal(candidate({ now: new Date("2026-10-22T00:01:00Z") }).eligible, false);
  assert.equal(candidate({ timezone: "America/New_York", now: new Date("2026-10-21T00:30:00Z"),
    workout: workout({ date: new Date("2026-10-20T04:00:00Z") }) }).eligible, true, "date eligibility follows the athlete's local day");
});

test("time budget uses the remaining plan plus actual work and blocks unknown effort or ambiguous copies", () => {
  const w = workout(), other = workout({ id: "remaining", durationMin: 20 });
  assert.equal(candidate({ sameDaySessions: [w, other] }).remainingPlanMinutes, 50);
  const actual = workout({ id: "actual", source: "manual", planned: false, completed: true, durationMin: 20, actualDurationMin: 20, rpe: 2, feedbackStatus: "completed" });
  assert.equal(candidate({ sameDaySessions: [w, actual], maxDailyMinutes: 50 }).eligible, true);
  for (const row of [{ ...actual, actualDurationMin: null, planned: true }, { ...actual, rpe: null }, { ...actual, rpe: 9 },
    { ...other, durationMin: null }, { ...other, durationMin: NaN }]) {
    assert.equal(candidate({ sameDaySessions: [w, row] }).eligible, false);
  }
  assert.equal(candidate({ sameDaySessions: [w, actual], maxDailyMinutes: 49 }).eligible, false);
  assert.equal(candidate({ sameDaySessions: [other] }).eligible, false);
  const a = { ...actual, id: "copy-a", source: "garmin", externalId: "a", distanceKm: 4 };
  const b = { ...actual, id: "copy-b", source: "whoop", externalId: "b", distanceKm: null };
  assert.equal(candidate({ sameDaySessions: [w, a, b] }).eligible, false);
  const decision: ActivityDecision = { version: 1, userId: "athlete", kind: "same_session", primaryId: a.id,
    recordedAt: "2026-10-21T11:00:00Z", members: [a,b].map(row => ({ id: row.id, fingerprint: activityFingerprint(row) })) };
  assert.equal(candidate({ sameDaySessions: [w, a, b], activityDecisions: [decision], maxDailyMinutes: 50 }).eligible, true);
  assert.equal(candidate({ sameDaySessions: [w, a, { ...b, actualDurationMin: 21 }], activityDecisions: [decision] }).eligible, false);
  for (const source of [null, "strava", "unknown-importer"]) {
    const restricted = candidate({ sameDaySessions: [w, { ...actual, source }] });
    assert.equal(restricted.eligible, false); assert.match(restricted.reason, /Strava-origin|unknown-origin|provenance/i);
  }
  assert.equal(candidate({ recentActivity: [{ ...actual, date: new Date("2026-10-20T00:00:00Z"), rpe: 9 }] }).eligible, false);
});

test("confirmation requires explicit denials, strict flags, current local day and exact source snapshot", () => {
  const c = candidate(), valid = answers(c);
  assert.ok(confirmedExistingReview(valid, c, "UTC", now));
  for (const key of ["sick", "newPain", "urgentSymptoms"]) {
    for (const value of [null, undefined, true, "false"]) assert.equal(confirmedExistingReview({ ...valid, [key]: value }, c, "UTC", now), null, key);
  }
  assert.equal(confirmedExistingReview(null, c, "UTC", now), null);
  assert.equal(confirmedExistingReview({ ...valid, painAffectsMovement: true }, c, "UTC", now), null);
  for (const key of ["noSymptoms", "recoveryUnchanged", "timeConfirmed"]) {
    for (const value of [false, null, "true", 1]) {
      const changed = structuredClone(valid); (changed.inputMetadata.existingReview as any)[key] = value;
      assert.equal(confirmedExistingReview(changed, c, "UTC", now), null, key);
    }
  }
  for (const patch of [{ sessionId: "another" }, { workoutRevision: "changed" }, { contextRevision: "changed" },
    { availableMin: 31 }, { confirmedAt: "2026-10-20T12:00:00Z" }, { confirmedAt: "2026-10-21T12:00:01Z" },
    { confirmedAt: "invalid" }, { version: "old" }]) {
    const changed = structuredClone(valid); Object.assign(changed.inputMetadata.existingReview, patch);
    assert.equal(confirmedExistingReview(changed, c, "UTC", now), null, JSON.stringify(patch));
  }
  assert.equal(confirmedExistingReview({ ...valid, availableMin: 31 }, c, "UTC", now), null);
  assert.equal(confirmedExistingReview(valid, { ...c, eligible: false }, "UTC", now), null);
  assert.equal(confirmedExistingReview(valid, c, "UTC", new Date("2026-10-22T00:00:00Z")), null);
});

test("unknown five subjective scales permit only the explicitly reviewed unchanged easy session", () => {
  const input = records(), before = JSON.stringify(input.workout);
  const initial = effectiveSessionFromRecords(input);
  assert.notEqual(initial.canonical.verdict, "ready");
  const saved = reviewed(input), result = effectiveSessionFromRecords(saved);
  assert.equal(result.canonical.verdict, "ready", result.canonical.reason);
  assert.equal(result.canonical.durationMin, 30); assert.equal(JSON.stringify(input.workout), before);
  const a = JSON.parse(saved.checkin!.answers!);
  for (const field of SUBJECTIVE_FIELDS) assert.equal(a[field], null);
  assert.equal(JSON.parse(saved.checkin!.adaptation!).scoreAvailable, false);
  const other = workout({ id: "another" });
  assert.notEqual(effectiveSessionFromRecords({ ...saved, workout: other, sameDaySessions: [other] }).canonical.verdict, "ready");
  for (const key of ["sick", "newPain", "urgentSymptoms", "painAffectsMovement"]) {
    const held = effectiveSessionFromRecords({ ...saved, checkin: { ...saved.checkin!, answers: JSON.stringify({ ...a, [key]: true }) } });
    assert.notEqual(held.canonical.verdict, "ready", key);
    assert.deepEqual(held.canonical.steps, []);
  }
  const currentHold = { date, answers: JSON.stringify({ sick: true }) };
  assert.notEqual(effectiveSessionFromRecords({ ...saved, currentCheckin: currentHold }).canonical.verdict, "ready");
});

test("review stays bound to profile/setup/event/budget/protocol and never releases replaced training", () => {
  const saved = reviewed();
  const w = saved.workout;
  const changedProfile = { ftp: 220 };
  for (const patch of [ { profile: { ftp: 200, injured: true } }, { currentPrescription: false },
    { planning: { ready: false, missing: ["baseline"], review: [], ruleId: "missing" } },
    { maxDailyMinutes: 20 }, { revisionContext: { sourceProfile: changedProfile, setupRevision: "reviewed-setup" }, profile: changedProfile },
    { revisionContext: { sourceProfile: { ftp: 200 }, setupRevision: "changed-setup" } },
    { currentEvents: [{ id: "event", userId: "athlete", date }] },
    { workout: { ...w, prescription: JSON.stringify({ ...JSON.parse(w.prescription), protocol: { id: "aerobic-power", version: "old" } }) } },
    { sameDaySessions: [w, workout({ id: "added", durationMin: 15 })] } ]) {
    const result = effectiveSessionFromRecords({ ...saved, ...patch } as EffectiveRecords);
    assert.notEqual(result.canonical.verdict, "ready", JSON.stringify(patch)); assert.deepEqual(result.canonical.steps, []);
  }
});

test("approval receipt changes do not invalidate a reviewed instruction/context snapshot", () => {
  const w = workout({ approved: true }), saved = reviewed(records({ workout: w, sameDaySessions: [w] }));
  const changed = { ...w, approved: false };
  const before = effectiveSessionFromRecords(saved), after = effectiveSessionFromRecords({ ...saved, workout: changed, sameDaySessions: [changed] });
  assert.equal(before.canonical.verdict, "ready", before.canonical.reason);
  assert.equal(after.existingReview.contextRevision, before.existingReview.contextRevision);
  assert.equal(after.canonical.verdict, "ready", after.canonical.reason);
});

test("restricted or unknown activity provenance remains held through a short-review attempt", () => {
  const saved = reviewed();
  for (const source of [null, "strava", "unknown-importer"]) {
    const actual = workout({ id: "reported", source, planned: false, completed: true,
      actualDurationMin: 10, rpe: 2, feedbackStatus: "completed", feedbackAt: new Date("2026-10-21T11:00:00Z") });
    const result = effectiveSessionFromRecords({ ...saved, reportedActivity: [actual], sameDaySessions: [saved.workout, actual] });
    assert.equal(result.existingReview.eligible, false); assert.notEqual(result.canonical.verdict, "ready");
    assert.deepEqual(result.canonical.steps, []);
  }
});

test("short review cannot erase a current full check-in recovery/time reduction or zero-minute hold", () => {
  const w = workout({ originalPlan: JSON.stringify({ durationMin: 30 }) });
  const fullAnswers = { sleep: 1, soreness: 5, motivation: 1, energy: 1, stress: 5,
    sick: false, newPain: false, urgentSymptoms: false, availableMin: 60 };
  for (const adaptation of [ { verdict: "trim", durationFactor: .5, intensityCap: "z2", safetyStatus: "clear" },
    { verdict: "easy", durationFactor: .6, intensityCap: "z1", safetyStatus: "clear" },
    { verdict: "rest", durationFactor: 0, intensityCap: "z1", safetyStatus: "clear" } ]) {
    const input = records({ workout: w, checkin: { date, answers: JSON.stringify(fullAnswers), adaptation: JSON.stringify(adaptation) } });
    const held = effectiveSessionFromRecords(input);
    assert.notEqual(held.canonical.verdict, "ready");
    assert.equal(held.existingReview.eligible, false, `current ${adaptation.verdict} restriction must remain authoritative`);
  }
  const noTime = effectiveSessionFromRecords(records({ workout: w, checkin: { date,
    answers: JSON.stringify({ ...fullAnswers, availableMin: 0 }),
    adaptation: JSON.stringify({ verdict: "full", durationFactor: 1, intensityCap: "z7", safetyStatus: "clear" }) } }));
  assert.equal(noTime.existingReview.eligible, false, "known zero available minutes is not missing data");
});

test("a previous day's check-in cannot establish today's readiness or perpetuate a day-scoped time restriction", () => {
  const input = records({ checkin: { date: new Date("2026-10-20T00:00:00Z"),
    answers: JSON.stringify({ sick: false, newPain: false, urgentSymptoms: false, availableMin: 0 }),
    adaptation: JSON.stringify({ verdict: "rest", durationFactor: 0, intensityCap: "z1", safetyStatus: "clear" }) } });
  const initial = effectiveSessionFromRecords(input);
  assert.notEqual(initial.canonical.verdict, "ready");
  assert.equal(initial.existingReview.eligible, true, initial.existingReview.reason);
  assert.equal(effectiveSessionFromRecords(reviewed(input)).canonical.verdict, "ready");
});
