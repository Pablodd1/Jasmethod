import test from "node:test";
import assert from "node:assert/strict";
import { reminderBlockers, workoutEmailBlockers } from "./reminder-readiness";
import { dueSchedule } from "./coaching-communication";
const settings = { primaryChannel: "telegram" as const, paused: false, dailyPlan: true, sessionFeedback: false,
  missingData: true, minuteOfDay: 300, quietStart: 1260, quietEnd: 300, timezone: "America/New_York", declinedOptional: [] };

test("workout email prerequisites are athlete-specific and independent of Calendar or Telegram",()=>{
  const ready={configured:true,cronConfigured:true,storageAvailable:true,enabled:true,verified:true,consent:true,purposes:true,timezoneMatches:true,languageSupported:true};
  assert.deepEqual(workoutEmailBlockers(ready),[]);
  for(const [field,blocker] of Object.entries({configured:"email_unconfigured",cronConfigured:"scheduler_unconfigured",storageAvailable:"email_storage_unavailable",enabled:"email_paused",verified:"email_unverified",consent:"email_consent_required",purposes:"email_no_purposes",timezoneMatches:"email_timezone_changed",languageSupported:"email_language_unsupported"}))assert.deepEqual(workoutEmailBlockers({...ready,[field]:false}),[blocker]);
});
test("5am Miami delivery requires enabled transport, verified chat, opt-in and no quiet-hour collision", () => {
  assert.deepEqual(reminderBlockers(settings, true, true), []);
  assert.equal(dueSchedule(settings, new Date("2026-10-13T09:00:00Z"))?.day, "2026-10-13");
  assert.deepEqual(reminderBlockers({ ...settings, quietEnd: 420 }, true, true), ["quiet_hours"]);
  assert.equal(dueSchedule({ ...settings, quietEnd: 420 }, new Date("2026-10-13T09:00:00Z")), null);
  assert.deepEqual(reminderBlockers({ ...settings, paused: true, dailyPlan: false, missingData: false, primaryChannel: "app" }, false, false),
    ["transport_disabled", "paused", "no_purposes", "unsupported_channel"]);
  assert.deepEqual(reminderBlockers(settings, true, false), ["telegram_unverified"]);
  assert.deepEqual(reminderBlockers({ ...settings, primaryChannel: "email" }, true, true), ["unsupported_channel"]);
});
