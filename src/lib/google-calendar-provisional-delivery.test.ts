import test from "node:test";
import assert from "node:assert/strict";
import { googleCalUpsertEvent } from "./importers";

test("JMM calendar PATCH clears old Busy reminders while held or unscheduled and restores defaults once timed and approved", async () => {
  const requests: Array<{url: string; method: string; body: any}> = [];
  const original = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    requests.push({url: String(url), method: init!.method!, body: JSON.parse(String(init!.body))});
    return Response.json({id:"existing-jmm-event"});
  };
  try {
    const base = {workoutId:"workout", existingGoogleId:"existing-jmm-event", summary:"JMM", durationMin:30};
    const date = {date:"2026-11-27"};
    const start = new Date("2026-11-27T14:00:00Z");
    await googleCalUpsertEvent("fixture", {...base, start:date, provisional:true});
    await googleCalUpsertEvent("fixture", {...base, start, provisional:false});
    await googleCalUpsertEvent("fixture", {...base, start, provisional:true});
    await googleCalUpsertEvent("fixture", {...base, start:date, provisional:false});
  } finally { globalThis.fetch = original; }
  assert.equal(requests.length,4);
  for (const r of requests) {
    assert.equal(r.method,"PATCH");
    assert.match(r.url,/\/existing-jmm-event$/);
    assert.equal(r.body.extendedProperties.private.jmmWorkoutId,"workout");
  }
  assert.deepEqual(requests.map(({body}) => [body.status, body.transparency, body.reminders]), [
    ["tentative","transparent",{useDefault:false,overrides:[]}],
    ["confirmed","opaque",{useDefault:true,overrides:null}],
    ["tentative","transparent",{useDefault:false,overrides:[]}],
    ["confirmed","transparent",{useDefault:false,overrides:[]}],
  ]);
});
