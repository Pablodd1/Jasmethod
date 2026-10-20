import test from "node:test";
import assert from "node:assert/strict";
import { boundedUploadForm, MAX_UPLOAD_BYTES, MAX_UPLOAD_REQUEST_BYTES } from "./upload-limits";
import { cleanupActivityStreams } from "./activity-stream-cleanup";
import type { StreamDelegate } from "./activity-stream-store";
import { normalizeStreams, parseStoredStreams } from "./activity-streams";
import { fadePercent } from "./next-workout-suggestion";
import { resample1Hz } from "./stream-analysis";
import { parseGarminActivitiesCsvDetailed } from "./garmin-activities-csv";
import { parseTcxActivities } from "./tcx-import";

test("upload accepts bounded multipart and rejects actual oversized bodies, including missing length", async () => {
  assert.ok(MAX_UPLOAD_BYTES < 4_500_000 && MAX_UPLOAD_REQUEST_BYTES < 4_500_000);
  const form = new FormData(); form.set("file", new File(["synthetic"], "fixture.csv"));
  assert.equal((await boundedUploadForm(new Request("http://localhost", { method: "POST", body: form }))).get("file") instanceof File, true);
  await assert.rejects(boundedUploadForm(new Request("http://localhost", { method: "POST", body: new Uint8Array(MAX_UPLOAD_REQUEST_BYTES + 1) })), /large/);
});
test("expiration cleanup physically deletes expired rows even with collection disabled; errors are explicit", async () => {
  const now = new Date(); let captured: unknown;
  const delegate = { deleteMany: async (args: unknown) => { captured = args; return { count: 2 }; } } as StreamDelegate;
  const original = process.env.ENABLE_ACTIVITY_STREAMS; process.env.ENABLE_ACTIVITY_STREAMS = "0";
  try {
    assert.deepEqual(await cleanupActivityStreams(delegate, now), { status: "ok", deleted: 2 });
    assert.deepEqual(captured, { where: { expiresAt: { lte: now } } });
    assert.equal((await cleanupActivityStreams({ deleteMany: async () => { throw { code: "P2021" }; } } as unknown as StreamDelegate)).status, "not_migrated");
    assert.equal((await cleanupActivityStreams({ deleteMany: async () => { throw new Error("fixture"); } } as unknown as StreamDelegate)).status, "failed");
  } finally { if (original === undefined) delete process.env.ENABLE_ACTIVITY_STREAMS; else process.env.ENABLE_ACTIVITY_STREAMS = original; }
});
test("stored streams reject oversized durations, unbounded samples and implausible biometrics", () => {
  const good = normalizeStreams([{ t: 0, hr: 130 }, { t: 60, hr: 131 }])!;
  for (const patch of [{ t: [0, 999999999] }, { hr: [130, 900] }, { reduced: "yes" }, { originalSampleCount: -1 }]) assert.equal(parseStoredStreams(JSON.stringify({ ...good, ...patch })), null);
  assert.ok(normalizeStreams(Array.from({ length: 10000 }, (_, t) => ({ t, hr: 130 })))!.t.length <= 3600);
  assert.equal(resample1Hz([0, 3600], [200, 200]).filter(x => x !== null).length, 2, "two samples do not become an hour of measured power");
});
test("heart-rate falls and unequal-duration efforts cannot be interpreted as external-output fade", () => {
  const efforts = [150, 140, 130].map(avg => ({ avg, durationS: 240, startS: 0, channel: "hr" as const, avgHrBpm: avg, zone: 4 }));
  assert.equal(fadePercent(efforts), null);
  assert.equal(fadePercent(efforts.map((e, i) => ({ ...e, channel: "power", durationS: i === 2 ? 1200 : 240 }))), null);
});
test("CSV distances require explicit export units; unknown stays unknown, imperial converts", () => {
  const csv = 'Activity Type,Date,Time,Distance\nRunning,2026-10-18 07:30:00,01:00:00,10';
  assert.equal(parseGarminActivitiesCsvDetailed(csv).activities[0].distanceKm, null);
  assert.equal(parseGarminActivitiesCsvDetailed(csv, "UTC", "metric").activities[0].distanceKm, 10);
  assert.equal(parseGarminActivitiesCsvDetailed(csv, "UTC", "imperial").activities[0].distanceKm, 16.09344);
  assert.equal(parseGarminActivitiesCsvDetailed(csv.replace("01:00:00", "01:99:00")).activities.length, 0);
});
test("a valid TCX with unknown author is imported with unknown origin, never relabelled Garmin", () => {
  const tcx = '<TrainingCenterDatabase><Activities><Activity Sport="Running"><Id>fixture</Id><Lap><TotalTimeSeconds>60</TotalTimeSeconds><Track><Trackpoint><Time>2026-10-18T10:00:00Z</Time></Trackpoint><Trackpoint><Time>2026-10-18T10:01:00Z</Time></Trackpoint></Track></Lap></Activity></Activities></TrainingCenterDatabase>';
  const result = parseTcxActivities(tcx); assert.ok(result.ok);
  assert.equal(result.activities[0].workout.source, "uploaded_unknown");
});
