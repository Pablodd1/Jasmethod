import test from "node:test";
import assert from "node:assert/strict";
import { normalizeStreams } from "./activity-streams";
import { deleteAllStreams, deleteStreams, DEFAULT_RETENTION_DAYS, loadStreams, prismaStreamRepo, purgeExpired, retentionDays, storeStreams, streamStorageEnabled, type StreamDelegate, type StreamRepo, type StreamRow } from "./activity-stream-store";

const streams = normalizeStreams(Array.from({ length: 600 }, (_, t) => ({ t, hr: 140, power: 200 })))!;
const ON = { ENABLE_ACTIVITY_STREAMS: "1" };
const GARMIN = { source: "garmin" };
const NOW = new Date("2026-10-20T12:00:00Z");

function fakeRepo() {
  const rows = new Map<string, StreamRow>();
  const repo: StreamRepo = {
    upsert: async row => { rows.set(row.workoutId, { ...row }); },
    find: async (userId, workoutId) => { const r = rows.get(workoutId); return r && r.userId === userId ? r : null; },
    deleteForWorkout: async (userId, workoutId) => { const r = rows.get(workoutId); if (r && r.userId === userId) { rows.delete(workoutId); return 1; } return 0; },
    deleteAllForUser: async userId => { let n = 0; for (const [k, r] of rows) if (r.userId === userId) { rows.delete(k); n++; } return n; },
    deleteExpired: async now => { let n = 0; for (const [k, r] of rows) if (r.expiresAt <= now) { rows.delete(k); n++; } return n; },
    listWorkoutIds: async (userId, now) => [...rows.values()].filter(r => r.userId === userId && r.expiresAt > now).map(r => r.workoutId),
  };
  return { repo, rows };
}

test("storage is OFF by default: the feature flag must be exactly '1'", async () => {
  const { repo, rows } = fakeRepo();
  for (const env of [{}, { ENABLE_ACTIVITY_STREAMS: "true" }, { ENABLE_ACTIVITY_STREAMS: "0" }]) {
    assert.equal(streamStorageEnabled(env), false);
    assert.equal(await storeStreams(repo, { athleteId: "a", workoutId: "w", streams, provenance: GARMIN, consent: true, env, now: NOW }), "disabled");
  }
  assert.equal(rows.size, 0);
});

test("no consent → nothing is stored, even with the flag on", async () => {
  const { repo, rows } = fakeRepo();
  for (const consent of [false, undefined as unknown as boolean, "true" as unknown as boolean, 1 as unknown as boolean])
    assert.equal(await storeStreams(repo, { athleteId: "a", workoutId: "w", streams, provenance: GARMIN, consent, env: ON, now: NOW }), "no_consent");
  assert.equal(rows.size, 0);
});

test("Strava-origin and unknown-origin activities are never stored, even with consent", async () => {
  const { repo, rows } = fakeRepo();
  for (const provenance of [{ source: "strava" }, { source: "intervals", notes: "Original source: STRAVA." }, { source: "tcx", externalId: "strava:1" }])
    assert.equal(await storeStreams(repo, { athleteId: "a", workoutId: "w", streams, provenance, consent: true, env: ON, now: NOW }), "strava_origin");
  for (const provenance of [{}, { source: "mystery" }])
    assert.equal(await storeStreams(repo, { athleteId: "a", workoutId: "w", streams, provenance, consent: true, env: ON, now: NOW }), "unknown_origin");
  assert.equal(rows.size, 0);
});

test("no usable streams → nothing stored", async () => {
  const { repo } = fakeRepo();
  assert.equal(await storeStreams(repo, { athleteId: "a", workoutId: "w", streams: null, provenance: GARMIN, consent: true, env: ON, now: NOW }), "no_streams");
});

test("consented, enabled, allowed origin → stored with consent time and a 180-day default expiry; round-trips intact", async () => {
  const { repo, rows } = fakeRepo();
  assert.equal(await storeStreams(repo, { athleteId: "a", workoutId: "w", streams, provenance: GARMIN, consent: true, env: ON, now: NOW }), "stored");
  const row = rows.get("w")!;
  assert.equal(row.consentAt.getTime(), NOW.getTime());
  assert.equal(row.expiresAt.getTime() - NOW.getTime(), DEFAULT_RETENTION_DAYS * 86_400_000);
  assert.equal(row.sampleCount, 600);
  assert.equal(row.durationSec, 599);
  assert.deepEqual(await loadStreams(repo, "a", "w", NOW), streams);
  assert.ok(!/lat|lon|gps/i.test(row.data), "no location fields");
});

test("retention is configurable but bounded; invalid values fall back to the default", () => {
  assert.equal(retentionDays({ ACTIVITY_STREAM_RETENTION_DAYS: "30" }), 30);
  assert.equal(retentionDays({ ACTIVITY_STREAM_RETENTION_DAYS: "365" }), 365);
  for (const bad of ["0", "-5", "366", "abc", "1.5", ""]) assert.equal(retentionDays({ ACTIVITY_STREAM_RETENTION_DAYS: bad }), DEFAULT_RETENTION_DAYS);
  assert.equal(retentionDays({}), DEFAULT_RETENTION_DAYS);
});

test("expired data is invisible to readers immediately and removed by purge", async () => {
  const { repo, rows } = fakeRepo();
  await storeStreams(repo, { athleteId: "a", workoutId: "w", streams, provenance: GARMIN, consent: true, env: { ...ON, ACTIVITY_STREAM_RETENTION_DAYS: "1" }, now: NOW });
  const later = new Date(NOW.getTime() + 2 * 86_400_000);
  assert.ok(await loadStreams(repo, "a", "w", new Date(NOW.getTime() + 3600_000)));
  assert.equal(await loadStreams(repo, "a", "w", later), null);
  assert.equal(rows.size, 1);
  assert.equal(await purgeExpired(repo, later), 1);
  assert.equal(rows.size, 0);
});

test("athlete isolation: another athlete cannot read or delete someone's streams", async () => {
  const { repo, rows } = fakeRepo();
  await storeStreams(repo, { athleteId: "a", workoutId: "w", streams, provenance: GARMIN, consent: true, env: ON, now: NOW });
  assert.equal(await loadStreams(repo, "b", "w", NOW), null);
  assert.equal(await deleteStreams(repo, "b", "w"), 0);
  assert.equal(rows.size, 1);
  assert.equal(await deleteStreams(repo, "a", "w"), 1);
  assert.equal(rows.size, 0);
});

test("delete-all removes only that athlete's data", async () => {
  const { repo, rows } = fakeRepo();
  for (const [athleteId, workoutId] of [["a", "w1"], ["a", "w2"], ["b", "w3"]]) await storeStreams(repo, { athleteId, workoutId, streams, provenance: GARMIN, consent: true, env: ON, now: NOW });
  assert.equal(await deleteAllStreams(repo, "a"), 2);
  assert.deepEqual([...rows.keys()], ["w3"]);
});

test("re-uploading the same activity replaces (not duplicates) its stored streams", async () => {
  const { repo, rows } = fakeRepo();
  await storeStreams(repo, { athleteId: "a", workoutId: "w", streams, provenance: GARMIN, consent: true, env: ON, now: NOW });
  await storeStreams(repo, { athleteId: "a", workoutId: "w", streams, provenance: GARMIN, consent: true, env: ON, now: new Date(NOW.getTime() + 1000) });
  assert.equal(rows.size, 1);
});

test("corrupt or wrong-version stored data is not returned", async () => {
  const { repo, rows } = fakeRepo();
  await storeStreams(repo, { athleteId: "a", workoutId: "w", streams, provenance: GARMIN, consent: true, env: ON, now: NOW });
  rows.get("w")!.data = "{not json";
  assert.equal(await loadStreams(repo, "a", "w", NOW), null);
  rows.get("w")!.data = JSON.stringify({ ...streams, version: 99 });
  assert.equal(await loadStreams(repo, "a", "w", NOW), null);
});

test("the Prisma adapter always scopes reads/deletes by athlete and purges by expiry only", async () => {
  const calls: any[] = [];
  const delegate: StreamDelegate = {
    upsert: async a => { calls.push(["upsert", a]); return {}; },
    findFirst: async a => { calls.push(["findFirst", a]); return null; },
    deleteMany: async a => { calls.push(["deleteMany", a]); return { count: 2 }; },
    findMany: async a => { calls.push(["findMany", a]); return [{ workoutId: "w" }]; },
  };
  const repo = prismaStreamRepo(delegate);
  await repo.find("a", "w"); await repo.deleteForWorkout("a", "w"); await repo.deleteAllForUser("a"); await repo.deleteExpired(NOW); await repo.listWorkoutIds("a", NOW);
  assert.deepEqual(calls[0], ["findFirst", { where: { userId: "a", workoutId: "w" } }]);
  assert.deepEqual(calls[1], ["deleteMany", { where: { userId: "a", workoutId: "w" } }]);
  assert.deepEqual(calls[2], ["deleteMany", { where: { userId: "a" } }]);
  assert.deepEqual(calls[3], ["deleteMany", { where: { expiresAt: { lte: NOW } } }]);
  assert.deepEqual(calls[4][1].where, { userId: "a", expiresAt: { gt: NOW } });
});
