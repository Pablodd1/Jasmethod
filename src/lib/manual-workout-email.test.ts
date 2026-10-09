import test from "node:test";
import assert from "node:assert/strict";
import { canonicalSession, type CanonicalSession, type TargetProfile } from "./canonical-session";
import {
  MANUAL_EMAIL_CONSENT,
  eligibleManualEmail,
  manualEmailActionable,
  manualEmailChanged,
  manualEmailConfigured,
  manualEmailDue,
  manualEmailKey,
  manualEmailOrigin,
  parseManualEmailSettings,
} from "./manual-workout-email";
import {
  MANUAL_GARMIN_FILE_HELP,
  MANUAL_GARMIN_MAC_HELP,
  manualWorkoutEmail,
  type ManualWorkoutEmailInput,
  type ManualWorkoutEmailReadyPlan,
} from "./manual-workout-email-template";
import { manualWorkoutEmailContent } from "./manual-workout-email-content";
import { buildSessionNutrition } from "./session-nutrition";
import { buildTrainingCalendar } from "./training-export";

// These fixtures exercise only pure code: no service, SMTP, network or database.
const now = new Date("2026-10-07T12:00:00Z");
const settings = {
  enabled: true, daily: true, revisions: true, timezone: "America/New_York",
  minuteOfDay: 360, leadMinutes: 90, consentVersion: MANUAL_EMAIL_CONSENT,
};
const preference = {
  enabled: true, recipient: "athlete@example.invalid", verifiedAt: now,
  consentAt: now, consentVersion: MANUAL_EMAIL_CONSENT,
};
const approvedWorkout = { approved: true, planned: true, completed: false, feedbackStatus: null };
const step = (extra: Record<string, unknown> = {}) => ({
  name: "Steady effort", seconds: 600, phase: "active", zone: "z2", ...extra,
});
function session({
  sport = "bike", steps = [step()], profile = {}, durationMin = 10,
  workout = {}, prescription = {},
}: {
  sport?: string; steps?: unknown[]; profile?: TargetProfile; durationMin?: number;
  workout?: Record<string, unknown>; prescription?: Record<string, unknown>;
} = {}): CanonicalSession {
  return canonicalSession({
    athleteId: "athlete-a",
    workout: { id: "session-a", userId: "athlete-a", sport, title: "PRIVATE_WORKOUT_TITLE", durationMin, notes: "PRIVATE_WORKOUT_NOTES", ...workout },
    prescription: { sport, durationMin, verdict: "full", steps, ...prescription },
    profile, dateLocal: "2026-10-07", timezone: "UTC",
  });
}
const due = { dateLocal: "2026-10-07", timezone: "UTC", startTime: "08:00", minuteOfDay: 360, leadMinutes: 90 };
const emailInput: ManualWorkoutEmailInput = {
  language: "en", kind: "ready", dateLabel: "2026-10-07", revision: "0123abcd",
  workoutUrl: "https://app.example.invalid/daily?sessionId=session-a",
  settingsUrl: "https://app.example.invalid/workout-email/settings",
};
const readyPlan: ManualWorkoutEmailReadyPlan = {
  summary: "CANONICAL_SUMMARY", steps: ["CANONICAL_STEP"],
  before: ["CANONICAL_BEFORE"], during: ["CANONICAL_DURING"], after: ["CANONICAL_AFTER"],
  preparation: ["CANONICAL_PREPARATION"], limitations: ["CANONICAL_LIMITATION"],
  graphicCid: "workout-profile@jmm", graphicAlt: "CANONICAL_GRAPHIC_ALT",
};

test("manual email is disabled unless all deployment prerequisites are explicit", () => {
  const env: NodeJS.ProcessEnv = { NODE_ENV: "test", ENABLE_MANUAL_WORKOUT_EMAIL: "true", SMTP_HOST: "smtp.example.invalid", SMTP_FROM: "workouts@example.invalid", MANUAL_WORKOUT_EMAIL_ORIGIN: "https://app.example.invalid" };
  assert.equal(manualEmailConfigured(env), true);
  assert.equal(manualEmailConfigured({ NODE_ENV: "test" }), false);
  for (const flag of [undefined, "false", "TRUE", "1"]) assert.equal(manualEmailConfigured({ ...env, ENABLE_MANUAL_WORKOUT_EMAIL: flag }), false);
  for (const field of ["SMTP_HOST", "SMTP_FROM", "MANUAL_WORKOUT_EMAIL_ORIGIN"]) assert.equal(manualEmailConfigured({ ...env, [field]: "" }), false, field);
});

test("trusted email origin requires a bare credential-free HTTPS origin", () => {
  assert.equal(manualEmailOrigin({ NODE_ENV: "test", MANUAL_WORKOUT_EMAIL_ORIGIN: "https://app.example.invalid/" }), "https://app.example.invalid");
  for (const origin of ["", "not a URL", "http://app.example.invalid", "https://name:secret@app.example.invalid", "https://app.example.invalid/daily", "https://app.example.invalid/?x=1", "https://app.example.invalid/#fragment"]) {
    assert.throws(() => manualEmailOrigin({ NODE_ENV: "test", MANUAL_WORKOUT_EMAIL_ORIGIN: origin }), Error, origin);
  }
});

test("enabling email needs a selected purpose and the exact current consent version", () => {
  const { consentVersion: _consent, ...expected } = settings;
  assert.deepEqual(parseManualEmailSettings(settings), { calendarGuidance: false, ...expected });
  assert.equal(parseManualEmailSettings({ ...settings, calendarGuidance: true }).calendarGuidance, true);
  assert.throws(() => parseManualEmailSettings({ ...settings, calendarGuidance: "true" }), /calendar guidance/);
  for (const consentVersion of [undefined, null, "manual-garmin-workout-email-v0", "other-purpose"]) {
    assert.throws(() => parseManualEmailSettings({ ...settings, consentVersion }), /accept workout email contents/);
  }
  assert.throws(() => parseManualEmailSettings({ ...settings, daily: false, revisions: false }), /purpose/);
  assert.equal(parseManualEmailSettings({ ...settings, enabled: false, daily: false, revisions: false, consentVersion: undefined }).enabled, false);
  assert.equal(parseManualEmailSettings({ ...settings, daily: false }).revisions, true);
  assert.equal(parseManualEmailSettings({ ...settings, revisions: false }).daily, true);
});

test("settings reject extra fields, coercion, invalid timezones and out-of-range send times", () => {
  for (const invalid of [null, [], "{}", 0]) assert.throws(() => parseManualEmailSettings(invalid), /Invalid preferences/);
  assert.throws(() => parseManualEmailSettings({ ...settings, recipient: "someone-else@example.invalid" }), /Unknown preference/);
  for (const field of ["enabled", "daily", "revisions"]) assert.throws(() => parseManualEmailSettings({ ...settings, [field]: "true" }), /Choose/);
  for (const timezone of [null, "Invalid/Timezone", "x".repeat(101)]) assert.throws(() => parseManualEmailSettings({ ...settings, timezone }), /timezone/);
  for (const minuteOfDay of [-1, 1440, 0.5, "360", NaN, Infinity]) assert.throws(() => parseManualEmailSettings({ ...settings, minuteOfDay }), /local send time/);
  for (const leadMinutes of [29, 721, 30.5, "90", NaN, Infinity]) assert.throws(() => parseManualEmailSettings({ ...settings, leadMinutes }), /30–720/);
  for (const minuteOfDay of [0, 1439]) assert.equal(parseManualEmailSettings({ ...settings, minuteOfDay }).minuteOfDay, minuteOfDay);
  for (const leadMinutes of [30, 720]) assert.equal(parseManualEmailSettings({ ...settings, leadMinutes }).leadMinutes, leadMinutes);
});

test("eligibility binds current consent and verification to the exact current recipient", () => {
  assert.equal(eligibleManualEmail(preference, preference.recipient), true);
  for (const override of [
    { enabled: false }, { recipient: null }, { recipient: "other@example.invalid" },
    { verifiedAt: null }, { consentAt: null }, { consentVersion: null },
    { consentVersion: "manual-garmin-workout-email-v0" },
  ]) assert.equal(eligibleManualEmail({ ...preference, ...override }, preference.recipient), false, JSON.stringify(override));
  assert.equal(eligibleManualEmail(preference, "changed@example.invalid"), false);
  assert.equal(eligibleManualEmail(preference, "ATHLETE@example.invalid"), false, "A changed recipient must be verified rather than normalized into authorization.");
});

test("outbox keys are stable and isolate recipient owner, session, exact revision and kind", () => {
  const key = manualEmailKey("a", "session", "revision", "ready");
  assert.match(key, /^[a-f0-9]{64}$/);
  assert.equal(key, manualEmailKey("a", "session", "revision", "ready"));
  for (const input of [["b", "session", "revision", "ready"], ["a", "other", "revision", "ready"], ["a", "session", "revised-sha", "ready"], ["a", "session", "revision", "held"]]) {
    assert.notEqual(key, manualEmailKey(input[0], input[1], input[2], input[3]));
  }
  assert.notEqual(manualEmailKey("a:b", "c", "d", "ready"), manualEmailKey("a", "b:c", "d", "ready"), "Tuple boundaries must not collide.");
});

test("daily email uses the earlier preferred time or start-minus-lead time", () => {
  assert.equal(manualEmailDue(due, new Date("2026-10-07T05:59:59.999Z")), false);
  assert.equal(manualEmailDue(due, new Date("2026-10-07T06:00:00Z")), true);
  const earlyStart = { ...due, startTime: "07:00" };
  assert.equal(manualEmailDue(earlyStart, new Date("2026-10-07T05:29:59.999Z")), false);
  assert.equal(manualEmailDue(earlyStart, new Date("2026-10-07T05:30:00Z")), true);
});

test("daily scheduling never sends a new actionable workout at or after its start", () => {
  assert.equal(manualEmailDue(due, new Date("2026-10-07T07:59:59.999Z")), true);
  assert.equal(manualEmailDue(due, new Date("2026-10-07T08:00:00Z")), false);
  assert.equal(manualEmailDue(due, new Date("2026-10-07T20:00:00Z")), false);
  assert.equal(manualEmailDue(due, new Date("2026-10-06T23:59:59Z")), false);
  assert.equal(manualEmailDue(due, new Date("2026-10-08T06:00:00Z")), false);
});

test("unknown start uses local preferred time without inventing a pre-training guarantee", () => {
  const withoutStart = { ...due, startTime: null };
  assert.equal(manualEmailDue(withoutStart, new Date("2026-10-07T05:59:59Z")), false);
  assert.equal(manualEmailDue(withoutStart, new Date("2026-10-07T06:00:00Z")), true);
  assert.equal(manualEmailDue(withoutStart, new Date("2026-10-07T23:59:59Z")), true);
  assert.equal(manualEmailDue(withoutStart, new Date("2026-10-08T00:00:00Z")), false);
});

test("daily scheduling uses the athlete's local date and IANA offset, including fractional offsets", () => {
  const newYork = { ...due, timezone: "America/New_York", startTime: null, minuteOfDay: 23 * 60 };
  assert.equal(manualEmailDue(newYork, new Date("2026-10-08T02:59:59Z")), false);
  assert.equal(manualEmailDue(newYork, new Date("2026-10-08T03:00:00Z")), true);
  assert.equal(manualEmailDue(newYork, new Date("2026-10-08T04:00:00Z")), false);
  const kathmandu = { ...due, timezone: "Asia/Kathmandu", startTime: null };
  assert.equal(manualEmailDue(kathmandu, new Date("2026-10-07T00:14:59Z")), false);
  assert.equal(manualEmailDue(kathmandu, new Date("2026-10-07T00:15:00Z")), true);
});

test("spring DST gaps skip nonexistent preferred or start wall times", () => {
  const spring = { ...due, dateLocal: "2026-03-08", timezone: "America/New_York", startTime: null, minuteOfDay: 150 };
  for (const time of ["2026-03-08T06:30:00Z", "2026-03-08T07:30:00Z", "2026-03-08T15:00:00Z"]) {
    assert.equal(manualEmailDue(spring, new Date(time)), false);
    assert.equal(manualEmailDue({ ...spring, minuteOfDay: 60, startTime: "02:30" }, new Date(time)), false);
  }
  assert.equal(manualEmailDue({ ...spring, minuteOfDay: 180 }, new Date("2026-03-08T07:00:00Z")), true);
});

test("fall DST repeated wall times share one deterministic outbox identity", () => {
  const fall = { ...due, dateLocal: "2026-11-01", timezone: "America/New_York", startTime: null, minuteOfDay: 90 };
  assert.equal(manualEmailDue(fall, new Date("2026-11-01T05:29:59Z")), false);
  const keys = ["2026-11-01T05:30:00Z", "2026-11-01T06:30:00Z"].map(time => {
    assert.equal(manualEmailDue(fall, new Date(time)), true);
    return manualEmailKey("athlete-a", "session-a", "exact-revision", "ready");
  });
  assert.equal(new Set(keys).size, 1, "Repeated wall time must not produce a second queue identity.");
});

test("actionability requires explicit approval of the complete current canonical revision", () => {
  const current = session();
  assert.equal(current.verdict, "ready");
  assert.equal(manualEmailActionable(current, approvedWorkout, current.revision), true);
  for (const confirmed of [null, "", current.revision.slice(0, 8), "outdated-revision"]) assert.equal(manualEmailActionable(current, approvedWorkout, confirmed), false);
  const changed = session({ steps: [step({ name: "Changed same-duration step" })] });
  assert.notEqual(changed.revision, current.revision);
  assert.equal(manualEmailActionable(changed, approvedWorkout, current.revision), false);
  assert.equal(manualEmailActionable(changed, approvedWorkout, changed.revision), true);
});

test("unapproved, unplanned, completed and any recorded feedback prevent actionable email", () => {
  const current = session();
  for (const override of [{ approved: false }, { planned: false }, { completed: true }, ...["completed", "partial", "skipped", "unknown"].map(feedbackStatus => ({ feedbackStatus }))]) {
    assert.equal(manualEmailActionable(current, { ...approvedWorkout, ...override }, current.revision), false, JSON.stringify(override));
  }
});

test("canonical safety holds, rest and unsupported exports never become actionable", () => {
  const held = session({ prescription: { steps: [] } });
  const rest = session({ profile: { injured: true } });
  const unsupported = session({ sport: "swim" });
  assert.equal(held.verdict, "blocked");
  assert.equal(rest.verdict, "rest");
  assert.equal(unsupported.capability.available, false);
  for (const current of [held, rest, unsupported]) assert.equal(manualEmailActionable(current, approvedWorkout, current.revision), false);
});

test("ZIP multisport exports remain held even with matching canonical approval", () => {
  const brick = session({ sport: "brick", durationMin: 20, prescription: { sportStructure: {
    schemaVersion: 1, kind: "brick",
    components: [
      { id: "bike", title: "Bike component", sport: "bike", durationMin: 10, steps: [step()] },
      { id: "run", title: "Run component", sport: "run", durationMin: 10, steps: [step()] },
    ],
    transitions: [{ afterComponentId: "bike", instruction: "Change shoes", endpoint: { type: "lap" } }],
  } } });
  assert.equal(brick.verdict, "ready", brick.reason);
  assert.equal(brick.capability.available, true);
  assert.equal(brick.capability.downloadFormat, "zip");
  assert.equal(manualEmailActionable(brick, approvedWorkout, brick.revision), false);
});

test("notification changes include same-revision approval/hold transitions and normalize revised to ready", () => {
  assert.equal(manualEmailChanged(undefined, { revision: "sha", kind: "ready" }), false);
  for (const [previous, current] of [["held", "ready"], ["ready", "held"], ["revised", "held"], ["ready", "cancelled"], ["cancelled", "ready"]]) {
    assert.equal(manualEmailChanged({ revision: "sha", kind: previous }, { revision: "sha", kind: current }), true, `${previous} to ${current}`);
  }
  assert.equal(manualEmailChanged({ revision: "sha", kind: "revised" }, { revision: "sha", kind: "ready" }), false);
  assert.equal(manualEmailChanged({ revision: "sha", kind: "held" }, { revision: "sha", kind: "held" }), false);
  assert.equal(manualEmailChanged({ revision: "old", kind: "ready" }, { revision: "new", kind: "ready" }), true);
});

for (const language of ["en", "es"] as const) {
  for (const kind of ["ready", "revised", "held", "cancelled"] as const) {
    test(`manual email ${language}/${kind} provides matching HTML/text and honest device status`, () => {
      const email = manualWorkoutEmail({ ...emailInput, language, kind, readyPlan });
      const actionable = kind === "ready" || kind === "revised";
      assert.ok(email.subject.length > 0);
      assert.doesNotMatch(email.subject, /[\r\n\u2028\u2029]/);
      assert.match(email.html, new RegExp(`<html lang="${language}">`));
      for (const output of [email.html, email.text]) {
        assert.ok(output.includes(emailInput.workoutUrl));
        assert.ok(output.includes(emailInput.settingsUrl));
        assert.ok(output.includes(emailInput.revision));
        if (actionable) {
          for (const marker of [readyPlan.summary, ...readyPlan.steps, ...readyPlan.before, ...readyPlan.during, ...readyPlan.after, ...readyPlan.preparation, ...readyPlan.limitations]) assert.ok(output.includes(marker), marker);
          assert.ok(output.includes(MANUAL_GARMIN_FILE_HELP));
          assert.ok(output.includes(MANUAL_GARMIN_MAC_HELP));
          assert.match(output, /Garmin\/NewFiles/);
          assert.match(output, language === "en" ? /Transfer to your Garmin has not been verified/ : /transferencia a tu Garmin no está verificada/);
          assert.match(output, /MTP/);
        } else {
          assert.doesNotMatch(output, /CANONICAL_|cid:|Garmin\/NewFiles|USB|Before: fueling/);
          assert.match(output, language === "en" ? /No workout file is attached/ : /No adjuntamos ningún archivo de entrenamiento/);
          assert.match(output, language === "en" ? /Do not use older files/ : /No uses archivos anteriores/);
        }
        if (kind === "revised") assert.match(output, language === "en" ? /Older email attachments do not update/ : /Los adjuntos de correos anteriores no se actualizan/);
      }
      if (actionable) {
        assert.match(email.html, /src="cid:workout-profile@jmm"/);
        assert.match(email.html, /alt="CANONICAL_GRAPHIC_ALT"/);
        assert.doesNotMatch(email.text, /<img|<p>|<li>/);
      }
    });
  }
}

test("template escapes all HTML content and link ampersands while keeping plain text readable", () => {
  const unsafe = `<script>alert("x")</script> & 'quote'`;
  const escaped = "&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; &amp; &#39;quote&#39;";
  const plan = { summary: unsafe, steps: [unsafe], before: [unsafe], during: [unsafe], after: [unsafe], preparation: [unsafe], limitations: [unsafe], graphicCid: "valid-profile@jmm", graphicAlt: unsafe };
  const email = manualWorkoutEmail({ ...emailInput, dateLabel: unsafe, revision: unsafe, workoutUrl: `${emailInput.workoutUrl}&view=plan`, readyPlan: plan });
  assert.doesNotMatch(email.html, /<script>|<\/script>/);
  assert.ok(email.html.includes(escaped));
  assert.ok(email.html.includes(`alt="${escaped}"`));
  assert.ok(email.html.includes("sessionId=session-a&amp;view=plan"));
  assert.ok(email.text.includes(unsafe));
  assert.ok(email.text.includes("sessionId=session-a&view=plan"));
});

test("template flattens display-label line breaks to prevent subject/header injection", () => {
  const email = manualWorkoutEmail({ ...emailInput, dateLabel: "2026-10-07\r\nBcc: hidden@example.invalid\u2028next", revision: "abc\ndef\u2029ghi" });
  assert.doesNotMatch(email.subject, /[\r\n\u2028\u2029]/);
  assert.match(email.text, /Revision: abc def ghi\./);
});

test("template rejects dangerous app protocols, credentials and cross-origin links", () => {
  for (const workoutUrl of ["javascript:alert(1)", "data:text/html,test", "file:///tmp/workout", "https://name:secret@app.example.invalid/daily", "https://other.example.invalid/daily"]) {
    assert.throws(() => manualWorkoutEmail({ ...emailInput, workoutUrl }), Error, workoutUrl);
  }
  assert.throws(() => manualWorkoutEmail({ ...emailInput, settingsUrl: "https://name@app.example.invalid/settings" }), /credentials/);
});

test("invalid graphic content IDs fail closed, but held/cancelled suppress the old graphic entirely", () => {
  for (const graphicCid of ['bad" onerror="alert(1)', "../file", "a\nb", "x".repeat(201)]) {
    assert.throws(() => manualWorkoutEmail({ ...emailInput, readyPlan: { ...readyPlan, graphicCid } }), /content ID/);
    for (const kind of ["held", "cancelled"] as const) {
      const email = manualWorkoutEmail({ ...emailInput, kind, readyPlan: { ...readyPlan, graphicCid } });
      assert.doesNotMatch(email.html, /<img|CANONICAL_|onerror=/);
    }
  }
});

test("canonical content preserves exact time, target units/source and a real PNG without raw notes", () => {
  const current = session({ profile: { ftp: 200 }, steps: [step({ note: "PRIVATE_STEP_NOTES" })] });
  const nutrition = buildSessionNutrition({ weightKg: 70 }, { ...current, intensity: "z2", startTime: "08:00" }, now);
  const { plan, graphic } = manualWorkoutEmailContent(current, nutrition, "08:00");
  assert.match(plan.summary, /08:00 \(UTC\).*10 min structured time/);
  assert.match(plan.steps[0], /600 s.*Z2.*150 W.*\[profile_reference\]/);
  assert.ok(Buffer.isBuffer(graphic));
  assert.equal(graphic!.subarray(0, 8).toString("hex"), "89504e470d0a1a0a");
  assert.equal(plan.graphicCid, "workout-profile@jmm");
  assert.match(plan.limitations.join(" "), /not measured physiological response/);
  assert.match(plan.limitations.join(" "), /No VO2max percentage/);
  assert.doesNotMatch(JSON.stringify(plan), /PRIVATE_WORKOUT_TITLE|PRIVATE_WORKOUT_NOTES|PRIVATE_STEP_NOTES/);
});

test("mixed endpoint content retains metres, reps and manual laps without a fabricated time graphic", () => {
  const current = session({ sport: "run", steps: [
    step({ endpoint: { type: "distance", meters: 1609.344 }, target: { type: "pace", low: 240, high: 300 } }),
    step({ name: "Reps", endpoint: { type: "reps", reps: 5 } }),
    step({ name: "Lap", endpoint: { type: "lap" } }),
  ] });
  assert.equal(current.verdict, "ready");
  const { plan, graphic } = manualWorkoutEmailContent(current, null, null);
  assert.equal(graphic, null);
  assert.equal(plan.graphicCid, undefined);
  assert.match(plan.summary, /Start time not set.*10 min planned estimate/);
  assert.match(plan.steps[0], /1609\.344 m.*4:00–5:00\/km.*\[explicit\]/);
  assert.match(plan.steps[1], /5 reps/);
  assert.match(plan.steps[2], /manual lap/);
  assert.match(plan.limitations.join(" "), /time-scaled graphic is unavailable/);
  assert.match(plan.before.join(" "), /guidance is unavailable/);
  assert.match(plan.during.join(" "), /No verified fueling quantities/);
  assert.match(plan.after.join(" "), /guidance is unavailable/);
});

test("content builder refuses held/rest sessions even if previous nutrition still exists", () => {
  const nutrition = buildSessionNutrition({ weightKg: 70 }, { ...session(), intensity: "z2" }, now);
  for (const current of [session({ prescription: { steps: [] } }), session({ profile: { injured: true } })]) {
    assert.throws(() => manualWorkoutEmailContent(current, nutrition, "08:00"), /Only a ready canonical session/);
  }
});

test("nutrition email keeps canonical quantities, safety notes and hourly recovery units without private observations", () => {
  const context = {
    version: "nutrition-context-v1",
    carbohydratePractice: { observedAt: "2026-10-01", sport: "bike", durationMin: 180, intensity: "z4", conditions: "PRIVATE_CONDITIONS", productMixture: "PRIVATE_MIXTURE", toleratedGPerHour: 50, targetGPerHour: 80, giSymptoms: "mild", reviewedHighIntake: true },
    sweatMeasurement: null,
    turnaround: { sessionId: "session-a", dateLocal: "2026-10-07", durationMin: 180, intensity: "z4", startTime: "08:00", nextSessionInHours: 3 },
  };
  const profile = { weightKg: 70, gutTrained: true, nutritionContext: JSON.stringify(context) };
  const current = session({ profile, durationMin: 180, steps: [step({ seconds: 10800, zone: "z4", note: "PRIVATE_STEP_NOTE" })] });
  const nutrition = buildSessionNutrition(profile, { ...current, intensity: "z4", startTime: "08:00" }, now)!;
  assert.equal(nutrition.fuel.carbsPerHourG, 50);
  assert.ok(nutrition.fuel.personalization.some(note => note.includes("GI symptoms: mild")));
  const { plan } = manualWorkoutEmailContent(current, nutrition, "08:00");
  assert.ok(plan.before.includes(nutrition.fuel.preSession.note));
  assert.ok(plan.during.includes(nutrition.fuel.notes));
  assert.ok(plan.after.includes(nutrition.post.note));
  assert.match(plan.during.join(" "), /50 g TOTAL carbohydrate\/hour/);
  assert.match(plan.during.join(" "), /700 ml fluid\/hour \(estimated\)/);
  assert.match(plan.during.join(" "), /490 mg sodium\/hour/);
  assert.match(plan.during.join(" "), /Avoid overdrinking/);
  assert.match(plan.during.join(" "), /Extra sodium does not make overdrinking safe/);
  assert.match(plan.during.join(" "), /Count carbohydrate from drinks and gels together, once/);
  assert.match(plan.after.join(" "), /70–84 g carbohydrate PER HOUR \(1\.0–1\.2 g\/kg\/h\)/);
  assert.match(plan.after.join(" "), /not a four-hour total/);
  for (const gap of nutrition.fuel.measurementGaps) assert.ok(plan.limitations.includes(gap), gap);
  for (const output of [JSON.stringify(plan), manualWorkoutEmail({ ...emailInput, readyPlan: plan }).html, manualWorkoutEmail({ ...emailInput, readyPlan: plan }).text]) {
    assert.doesNotMatch(output, /PRIVATE_|GI symptoms: mild|70 kg supplied body weight|requested 80 g\/h|caffeine/i);
  }
});

test("missing nutrition measurements stay explicit and do not invent physiological targets", () => {
  const current = session({ sport: "run", durationMin: 90, steps: [step({ seconds: 5400 })] });
  const nutrition = buildSessionNutrition({}, { ...current, intensity: "z2" }, now)!;
  const { plan } = manualWorkoutEmailContent(current, nutrition, null);
  for (const gap of nutrition.fuel.measurementGaps) assert.ok(plan.limitations.includes(gap));
  assert.match(plan.limitations.join(" "), /Current weight not supplied/);
  assert.match(plan.limitations.join(" "), /Sweat rate unknown/);
  assert.match(plan.limitations.join(" "), /Sweat sodium unknown/);
  assert.match(plan.limitations.join(" "), /educational, not a measured requirement/);
  assert.match(plan.before.join(" "), /Current weight is unknown/);
  assert.match(plan.after.join(" "), /weight-based totals are unavailable/);
  assert.match(plan.steps[0], /Open effort.*\[effort\]/);
  assert.doesNotMatch(plan.steps.join(" "), /bpm|VO2max|kcal|calories|\d+ W/);
});

test("higher-intake email preserves canonical totals and review warnings without inventing a progression", () => {
  const profile = { nutritionContext: JSON.stringify({
    version: "nutrition-context-v1",
    carbohydratePractice: { observedAt: "2026-10-01", sport: "bike", durationMin: 180, intensity: "z4", conditions: "PRIVATE_CONDITIONS", productMixture: "PRIVATE_MIXTURE", toleratedGPerHour: 80, targetGPerHour: 80, giSymptoms: "none", reviewedHighIntake: true },
    sweatMeasurement: null, turnaround: null,
  }) };
  const current = session({ profile, durationMin: 180, steps: [step({ seconds: 10800, zone: "z4" })] });
  const nutrition = buildSessionNutrition(profile, { ...current, intensity: "z4", conditions: "PRIVATE_CONDITIONS" }, now)!;
  assert.equal(nutrition.fuel.carbsPerHourG, 80);
  const { plan, graphic } = manualWorkoutEmailContent(current, nutrition, null, false);
  assert.equal(graphic, null);
  assert.equal(plan.graphicCid, undefined);
  assert.match(plan.during.join(" "), /80 g TOTAL carbohydrate\/hour/);
  assert.match(plan.during.join(" "), /previously tolerated practice/);
  assert.match(plan.during.join(" "), /Above 90 g\/h requires individualized review and rehearsal/);
  assert.match(plan.during.join(" "), /never make a first attempt on race day/);
  assert.doesNotMatch(JSON.stringify(plan), /PRIVATE_|GI symptoms: none|requested 80|60, 80, 90 or 100/);
});

test("downloaded held calendar excludes private safety/step notes and links only to the authenticated current plan", () => {
  const workout = { id: "session-a", userId: "athlete-a", date: now, title: "Planned bike ride", sport: "bike", durationMin: 10, startTime: "08:00", notes: "PRIVATE_WORKOUT_NOTES" };
  const prescription = { sport: "bike", durationMin: 10, verdict: "full", steps: [step({ name: "PRIVATE_PRIOR_STEP_NAME", note: "PRIVATE_STEP_NOTE" })] };
  const held = canonicalSession({ athleteId: "athlete-a", workout, prescription, dateLocal: "2026-10-07", timezone: "UTC", safety: { status: "unknown", reason: "PRIVATE_SAFETY_REASON" } });
  assert.equal(held.verdict, "blocked");
  const calendar = buildTrainingCalendar({
    athlete: { name: "Example Athlete", email: "athlete@example.invalid", timezone: "UTC" },
    workouts: [], metrics: [], sleep: [], checkins: [],
    plan: { name: "Training plan", days: [{ date: now, week: 1, dayOff: false, sessions: [{ ...workout, prescription: JSON.stringify(prescription) }] }] },
    resolvedSessions: { [workout.id]: held },
  });
  const calendarContent = calendar.replace(/\r\n[ \t]/g, "");
  assert.match(calendarContent, /BEGIN:VEVENT/);
  assert.match(calendarContent, /SUMMARY:JMM provisional session/);
  assert.match(calendarContent, /PROVISIONAL \/ ON HOLD/);
  assert.match(calendarContent, /sign-in required/);
  assert.match(calendarContent, /\/daily\?sessionId=session-a/);
  assert.match(calendarContent, /Downloaded calendar snapshot/);
  assert.match(calendarContent, /later changes require a fresh export/);
  assert.match(calendarContent, /does not auto-sync/);
  assert.doesNotMatch(calendarContent, /PRIVATE_SAFETY_REASON|PRIVATE_STEP_NOTE|PRIVATE_PRIOR_STEP_NAME|PRIVATE_WORKOUT_NOTES|[?&]token=|\/api\/workout-graphic/);
});

test("Spanish canonical content keeps exact fuel/target quantities and safety qualifications without English or private context", () => {
  const profile = { ftp: 200, weightKg: 70, nutritionContext: JSON.stringify({
    version: "nutrition-context-v1",
    carbohydratePractice: { observedAt: "2026-10-01", sport: "bike", durationMin: 180, intensity: "z4", conditions: "PRIVATE_CONDITIONS", productMixture: "PRIVATE_MIXTURE", toleratedGPerHour: 50, targetGPerHour: 80, giSymptoms: "mild", reviewedHighIntake: true },
    sweatMeasurement: null,
    turnaround: { sessionId: "session-a", dateLocal: "2026-10-07", durationMin: 180, intensity: "z4", startTime: "08:00", nextSessionInHours: 3 },
  }) };
  const current = session({ profile, durationMin: 180, steps: [step({ name: "Referencia original", seconds: 10800, zone: "z4", note: "PRIVATE_STEP_NOTE" })] });
  const nutrition = buildSessionNutrition(profile, { ...current, intensity: "z4", startTime: "08:00" }, now)!;
  const { plan, graphic } = manualWorkoutEmailContent(current, nutrition, "08:00", true, "es");
  assert.ok(Buffer.isBuffer(graphic));
  assert.match(plan.summary, /08:00 \(UTC\).*ciclismo.*180 min de tiempo estructurado/);
  assert.match(plan.steps[0], /10800 s.*Zona Z4.*Potencia: ≤210 W.*referencia del perfil/);
  assert.match(plan.before.join(" "), /140 g de carbohidratos.*70 g \(1 g\/kg\)/);
  assert.match(plan.during.join(" "), /50 g de carbohidratos TOTALES\/hora/);
  assert.match(plan.during.join(" "), /700 ml de líquidos\/hora \(estimado\)/);
  assert.match(plan.during.join(" "), /490 mg de sodio\/hora/);
  assert.match(plan.during.join(" "), /Evita beber en exceso/);
  assert.match(plan.during.join(" "), /El sodio adicional no hace seguro beber en exceso/);
  assert.match(plan.after.join(" "), /70–84 g de carbohidratos POR HORA \(1,0–1,2 g\/kg\/h\)/);
  assert.match(plan.after.join(" "), /No es el total para cuatro horas/);
  assert.match(plan.limitations.join(" "), /Se desconoce la tasa de sudoración/);
  assert.match(plan.limitations.join(" "), /Se desconoce el sodio del sudor/);
  assert.match(plan.limitations.join(" "), /educativa, no una necesidad medida/);
  const email = manualWorkoutEmail({ ...emailInput, language: "es", readyPlan: plan });
  for (const output of [JSON.stringify(plan), email.html, email.text]) {
    assert.doesNotMatch(output, /PRIVATE_|GI symptoms: mild|70 kg supplied body weight|requested 80|General planning example|Current weight|Short recovery before|Avoid overdrinking|Weather and location|No hay una versión verificada en español/);
  }
});
