import assert from "node:assert/strict";
import test from "node:test";
import { Encoder, Profile } from "@garmin/fitsdk";
import { parseTcxActivities } from "./tcx-import";
import { parseTcx, parseGarminActivitiesCsv } from "./importers";
import { parseGarminActivitiesCsvDetailed, parseGarminNumber, parseCsvRows } from "./garmin-activities-csv";
import { decodeFitActivity } from "./fit-import";
import { sniffUpload, uploadProblem } from "./import-files";
import { MAX_STREAM_POINTS, normalizeStreams, parseStoredStreams, streamCoverage, usableChannels } from "./activity-streams";

// ------------------------------------------------------------------ synthetic fixtures (no athlete data)
const T0 = Date.parse("2026-10-18T11:30:00Z");
const iso = (offsetSec: number) => new Date(T0 + offsetSec * 1000).toISOString().replace(".000Z", "Z");
function trackpoint(i: number, extra: { hr?: number; watts?: number; dist?: number; alt?: number } = {}) {
  return `<Trackpoint><Time>${iso(i)}</Time>${extra.alt !== undefined ? `<AltitudeMeters>${extra.alt}</AltitudeMeters>` : ""}${extra.dist !== undefined ? `<DistanceMeters>${extra.dist}</DistanceMeters>` : ""}${extra.hr !== undefined ? `<HeartRateBpm><Value>${extra.hr}</Value></HeartRateBpm>` : ""}${extra.watts !== undefined ? `<Extensions><ns3:TPX xmlns:ns3="http://www.garmin.com/xmlschemas/ActivityExtension/v2"><ns3:Watts>${extra.watts}</ns3:Watts></ns3:TPX></Extensions>` : ""}</Trackpoint>`;
}
function lap(startSec: number, seconds: number, opts: { calories?: number; dist?: number; avgHr?: number; maxHr?: number; points: string[] }) {
  return `<Lap StartTime="${iso(startSec)}"><TotalTimeSeconds>${seconds}</TotalTimeSeconds>${opts.dist !== undefined ? `<DistanceMeters>${opts.dist}</DistanceMeters>` : ""}${opts.calories !== undefined ? `<Calories>${opts.calories}</Calories>` : ""}${opts.avgHr !== undefined ? `<AverageHeartRateBpm><Value>${opts.avgHr}</Value></AverageHeartRateBpm>` : ""}${opts.maxHr !== undefined ? `<MaximumHeartRateBpm><Value>${opts.maxHr}</Value></MaximumHeartRateBpm>` : ""}<Track>${opts.points.join("")}</Track></Lap>`;
}
const tcxDoc = (activities: string, creator = "Forerunner 945") => `<?xml version="1.0" encoding="UTF-8"?><TrainingCenterDatabase xmlns="http://www.garmin.com/xmlschemas/TrainingCenterDatabase/v2"><Activities>${activities}</Activities><Author xsi:type="Application_t" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><Name>${creator}</Name></Author></TrainingCenterDatabase>`;
const run = (id: string, laps: string) => `<Activity Sport="Running"><Id>${id}</Id>${laps}</Activity>`;
const twoLapRun = () => run(iso(0), lap(0, 600, { calories: 100, dist: 2000, avgHr: 140, maxHr: 150, points: [trackpoint(0, { hr: 130, dist: 0 }), trackpoint(300, { hr: 140, dist: 1000 }), trackpoint(600, { hr: 150, dist: 2000 })] })
  + lap(600, 1200, { calories: 250, dist: 4000, avgHr: 160, maxHr: 172, points: [trackpoint(900, { hr: 160, dist: 3000 }), trackpoint(1800, { hr: 172, dist: 6000 })] }));

// ------------------------------------------------------------------ TCX
test("TCX: calories are summed over ALL laps (the old parser kept only the first)", () => {
  const result = parseTcxActivities(tcxDoc(twoLapRun()));
  assert.ok(result.ok);
  const w = result.activities[0].workout;
  assert.equal(w.calories, 350);
  assert.equal(w.durationMin, 30);            // 1800 s of lap timer time
  assert.equal(w.distanceKm, 6);              // lap distances 2000 + 4000 m
  assert.equal(w.maxHr, 172);
  assert.equal(w.avgHr, Math.round((140 * 600 + 160 * 1200) / 1800));  // time-weighted, not a mean of samples
  assert.equal(w.externalId, `tcx:${iso(0)}`);
  assert.equal(w.source, "garmin");
  assert.equal(w.sport, "run");
});

test("TCX: missing fields stay undefined, never 0 (no power meter, no calories, no HR)", () => {
  const doc = tcxDoc(run(iso(0), lap(0, 120, { points: [trackpoint(0), trackpoint(60), trackpoint(120)] })));
  const result = parseTcxActivities(doc);
  assert.ok(result.ok);
  const w = result.activities[0].workout;
  assert.equal(w.avgHr, undefined); assert.equal(w.maxHr, undefined); assert.equal(w.avgPower, undefined);
  assert.equal(w.calories, undefined); assert.equal(w.distanceKm, undefined);
});

test("TCX: a one-point or sub-30-second file is skipped and counted, not given an invented 1-minute duration", () => {
  const result = parseTcxActivities(tcxDoc(run(iso(0), lap(0, 5, { points: [trackpoint(0, { hr: 120 })] })) + run(iso(100), lap(100, 600, { points: [trackpoint(100), trackpoint(700)] }))));
  assert.ok(result.ok);
  assert.equal(result.activities.length, 1);
  assert.equal(result.skipped.tooShort, 1);
  assert.deepEqual(parseTcx(tcxDoc(run(iso(0), lap(0, 5, { points: [trackpoint(0)] })))), []);
});

test("TCX: streams keep dropouts as null and carry watts from namespaced extensions", () => {
  const points = [trackpoint(0, { hr: 120, watts: 150 }), trackpoint(1, { watts: 160 }), trackpoint(2, { hr: 122 }), trackpoint(3, { hr: 124, watts: 0 })];
  const result = parseTcxActivities(tcxDoc(`<Activity Sport="Biking"><Id>${iso(0)}</Id>${lap(0, 60, { points })}</Activity>`));
  assert.ok(result.ok);
  const streams = result.activities[0].streams!;
  assert.deepEqual(streams.hr, [120, null, 122, 124]);
  assert.deepEqual(streams.power, [150, 160, null, 0]);   // a real 0 W is kept; a missing sample is null
  assert.equal(result.activities[0].workout.sport, "bike");
  assert.equal(result.activities[0].workout.avgPower, Math.round((150 + 160 + 0) / 3));
});

test("TCX: DOCTYPE/ENTITY declarations are refused before parsing", () => {
  const bomb = `<?xml version="1.0"?><!DOCTYPE lolz [<!ENTITY a "aaaa"><!ENTITY b "&a;&a;&a;&a;">]>` + tcxDoc(twoLapRun()).replace(/^<\?xml[^>]*\?>/, "");
  const result = parseTcxActivities(bomb);
  assert.equal(result.ok, false);
  assert.equal(!result.ok && result.error, "doctype_rejected");
  assert.deepEqual(parseTcx(bomb), []);
});

test("TCX: non-TCX XML and malformed XML are refused with a reason, not imported as zero rows", () => {
  const notTcx = parseTcxActivities(`<?xml version="1.0"?><HealthData></HealthData>`);
  assert.equal(!notTcx.ok && notTcx.error, "not_tcx");
  const broken = parseTcxActivities(`<TrainingCenterDatabase><Activities><Activity Sport="Running"><Id>x</Id><Lap></Activities>`);
  assert.equal(broken.ok, false);
  assert.equal(!broken.ok && broken.error, "parse_failed");
});

test("TCX: a file whose metadata names Strava is marked Strava-origin and not stored as a Garmin record", () => {
  const result = parseTcxActivities(tcxDoc(twoLapRun(), "Strava"));
  assert.ok(result.ok);
  assert.equal(result.activities[0].stravaMarked, true);
  assert.equal(result.activities[0].workout.source, "tcx");
  assert.match(result.activities[0].workout.notes!, /Original source: STRAVA/);
});

// ------------------------------------------------------------------ Garmin Activities.csv
const HEADER = `"Activity Type","Date","Favorite","Title","Distance","Calories","Time","Avg HR","Max HR","Avg Power","Normalized Power® (NP®)","Training Stress Score®"`;
const csv = (...rows: string[]) => [HEADER, ...rows].join("\r\n") + "\r\n";

test("CSV: English export parses; swims are metres, runs are km, '--' is unknown (null), not 0", () => {
  const result = parseGarminActivitiesCsvDetailed(csv(
    `"Running","2026-10-18 07:30:00","false","Morning Run","10.02","640","00:50:30","151","172","--","--","--"`,
    `"Pool Swim","2026-10-17 06:00:00","false","Lap swim","1,620","300","00:35:00","--","--","--","--","--"`,
    `"Cycling","2026-10-16 17:00:00","false","Ride","54.09","1,420","02:10:00","140","165","210","225","130.5"`,
  ), "America/New_York", "metric");
  assert.equal(result.ok, true);
  const [r, s, c] = result.activities;
  assert.deepEqual([r.sport, r.distanceKm, r.durationMin, r.avgHr, r.avgPower], ["run", 10.02, 51, 151, null]);
  assert.deepEqual([s.sport, s.distanceKm, s.avgHr], ["swim", 1.62, null]);
  assert.deepEqual([c.sport, c.distanceKm, c.calories, c.avgPower, c.np, c.tss], ["bike", 54.09, 1420, 210, 225, 130.5]);
  assert.equal(r.externalId, "garmin-csv:2026-10-18 07:30:00:Morning Run");   // unchanged id format: re-imports update, not duplicate
});

test("CSV: local timestamps use the athlete's timezone (early-morning activity stays on its own day)", () => {
  const row = `"Running","2026-10-18 02:00:00","false","Early","5.00","300","00:30:00","140","150","--","--","--"`;
  const miami = parseGarminActivitiesCsvDetailed(csv(row), "America/New_York").activities[0];
  assert.equal(miami.date.toISOString(), "2026-10-18T06:00:00.000Z");
  const utc = parseGarminActivitiesCsvDetailed(csv(row)).activities[0];
  assert.equal(utc.date.toISOString(), "2026-10-18T02:00:00.000Z");
});

test("CSV: decimal-comma numbers become unknown and are counted, never turned into 5409 km", () => {
  const result = parseGarminActivitiesCsvDetailed(csv(`"Running","2026-10-18 07:30:00","false","Run","54,09","640","00:50:30","151","172","--","--","--"`));
  assert.equal(result.activities[0].distanceKm, null);
  assert.equal(result.ambiguousNumbers, 1);
  assert.deepEqual(parseGarminNumber("54,09"), { value: null, ambiguous: true });
  assert.deepEqual(parseGarminNumber("1,620"), { value: 1620, ambiguous: false });
  assert.deepEqual(parseGarminNumber("--"), { value: null, ambiguous: false });
});

test("CSV: unsupported types are reported with counts; walking is NOT imported as running", () => {
  const result = parseGarminActivitiesCsvDetailed(csv(
    `"Walking","2026-10-18 07:30:00","false","Walk","3.00","150","00:40:00","110","120","--","--","--"`,
    `"Strength Training","2026-10-18 09:00:00","false","Gym","--","200","00:45:00","110","130","--","--","--"`,
    `"Strength Training","2026-10-19 09:00:00","false","Gym2","--","200","00:45:00","110","130","--","--","--"`,
    `"Running","2026-10-19 07:00:00","false","Run","5.00","300","00:30:00","140","150","--","--","--"`,
  ));
  assert.equal(result.activities.length, 1);
  assert.equal(result.skipped.unsupported_activity_type, 3);
  assert.deepEqual(result.unsupportedTypes, { Walking: 1, "Strength Training": 2 });
});

test("CSV: a zero/blank duration or an unreadable date skips only that row (the old importer aborted the whole file)", () => {
  const result = parseGarminActivitiesCsvDetailed(csv(
    `"Running","2026-10-18 07:30:00","false","Zero","1.00","10","00:00:10","--","--","--","--","--"`,
    `"Running","18/10/2026 07:30","false","BadDate","5.00","300","00:30:00","--","--","--","--","--"`,
    `"Running","2026-10-19 07:00:00","false","Good","5.00","300","00:30:00","140","150","--","--","--"`,
  ));
  assert.deepEqual(result.activities.map(a => a.title), ["Good"]);
  assert.equal(result.skipped.bad_duration, 1);
  assert.equal(result.skipped.bad_date, 1);
});

test("CSV: implausible values become unknown rather than being stored", () => {
  const result = parseGarminActivitiesCsvDetailed(csv(`"Running","2026-10-18 07:30:00","false","Run","9000.00","640","00:50:30","400","172","--","--","--"`));
  assert.equal(result.activities[0].distanceKm, null);
  assert.equal(result.activities[0].avgHr, null);
  assert.equal(result.implausibleValues, 2);
});

test("CSV: non-English headers are refused with the column names found, not silently imported as zero rows", () => {
  const spanish = `"Tipo de actividad","Fecha","Título","Distancia","Tiempo"\r\n"Correr","2026-10-18 07:30:00","Carrera","10,02","00:50:30"\r\n`;
  const result = parseGarminActivitiesCsvDetailed(spanish);
  assert.equal(result.ok, false);
  assert.equal(result.error, "unrecognized_columns");
  assert.deepEqual(result.foundColumns, ["Tipo de actividad", "Fecha", "Título", "Distancia", "Tiempo"]);
  assert.deepEqual(parseGarminActivitiesCsv(spanish), []);
});

test("CSV: BOM, CRLF, quoted commas, doubled quotes and embedded newlines are handled", () => {
  const text = "﻿" + csv(`"Running","2026-10-18 07:30:00","false","Run, with ""quotes""\nand a newline","5.00","300","00:30:00","140","150","--","--","--"`);
  const result = parseGarminActivitiesCsvDetailed(text);
  assert.equal(result.activities.length, 1);
  assert.equal(result.activities[0].title, 'Run, with "quotes"\nand a newline');
  assert.deepEqual(parseCsvRows('a,"b,c"\n"d""e",f'), [["a", "b,c"], ['d"e', "f"]]);
  assert.equal(parseGarminActivitiesCsvDetailed("").error, "empty");
});

// ------------------------------------------------------------------ FIT (activity files, decoded with the official SDK)
function fitActivity(opts: { type?: string; manufacturer?: string; sport?: string; subSport?: string; seconds?: number; records?: Record<string, unknown>[]; avgHr?: number } = {}): Uint8Array {
  const seconds = opts.seconds ?? 120;
  const start = new Date(T0);
  const encoder = new Encoder();
  encoder.onMesg(Profile.MesgNum.FILE_ID, { type: opts.type ?? "activity", manufacturer: opts.manufacturer ?? "garmin", product: 7, serialNumber: 424242, timeCreated: start } as any);
  const records = opts.records ?? Array.from({ length: seconds + 1 }, (_, i) => ({ timestamp: new Date(T0 + i * 1000), heartRate: 120 + (i % 20), power: 200 + (i % 10), cadence: 85, speed: 3.2, altitude: 10 + i / 10, distance: i * 3.2 }));
  for (const record of records) encoder.onMesg(Profile.MesgNum.RECORD, record as any);
  encoder.onMesg(Profile.MesgNum.SESSION, { timestamp: new Date(T0 + seconds * 1000), startTime: start, totalElapsedTime: seconds, totalTimerTime: seconds, totalDistance: seconds * 3.2,
    sport: opts.sport ?? "cycling", subSport: opts.subSport ?? "generic", avgHeartRate: opts.avgHr ?? 130, maxHeartRate: 139, avgPower: 205, normalizedPower: 210, totalCalories: 55 } as any);
  encoder.onMesg(Profile.MesgNum.ACTIVITY, { timestamp: new Date(T0 + seconds * 1000), numSessions: 1, type: "manual", event: "activity", eventType: "stop" } as any);
  return encoder.close();
}

test("FIT: a valid activity decodes to a summary and streams", () => {
  const result = decodeFitActivity(fitActivity());
  assert.ok(result.ok, JSON.stringify(result));
  assert.equal(result.activities.length, 1);
  const { workout, streams } = result.activities[0];
  assert.equal(workout.sport, "bike");
  assert.equal(workout.durationMin, 2);
  assert.equal(workout.avgHr, 130); assert.equal(workout.maxHr, 139); assert.equal(workout.avgPower, 205); assert.equal(workout.np, 210);
  assert.equal(workout.distanceKm, 0.38);
  assert.equal(workout.source, "fit");
  assert.match(workout.externalId, /^fit:[0-9a-f]{16}:2026-10-18T11:30:00\.000Z$/);
  assert.ok(streams && streams.t.length === 121);
  assert.deepEqual(Object.keys(streams!).includes("positionLat"), false);   // GPS is never read
  assert.equal(streams!.hr[0], 120);
});

test("FIT: missing heart-rate samples are null in the stream, not 0 bpm", () => {
  const records = Array.from({ length: 61 }, (_, i) => ({ timestamp: new Date(T0 + i * 1000), ...(i % 3 === 0 ? {} : { heartRate: 140 }), power: 180 }));
  const result = decodeFitActivity(fitActivity({ seconds: 60, records }));
  assert.ok(result.ok);
  const hr = result.activities[0].streams!.hr;
  assert.equal(hr[0], null); assert.equal(hr[1], 140); assert.equal(hr.filter(v => v === 0).length, 0);
  const cover = streamCoverage(result.activities[0].streams!).find(c => c.channel === "hr")!;
  assert.ok(cover.fraction! > 0.6 && cover.fraction! < 0.7);
});

test("FIT: a planned-workout FIT (type 'workout') is refused as not an activity", () => {
  const result = decodeFitActivity(fitActivity({ type: "workout" }));
  assert.deepEqual(result, { ok: false, error: "not_activity" });
});

test("FIT: corrupted, truncated, or non-FIT bytes import nothing, with distinct reasons", () => {
  const good = fitActivity();
  const flipped = Uint8Array.from(good); flipped[Math.floor(good.length / 2)] ^= 0xff;
  assert.equal((decodeFitActivity(flipped) as { error: string }).error, "integrity_failed");
  assert.equal(decodeFitActivity(good.subarray(0, good.length - 40)).ok, false);
  assert.equal((decodeFitActivity(new TextEncoder().encode("not a fit file at all")) as { error: string }).error, "not_fit");
  assert.equal((decodeFitActivity(new Uint8Array(0)) as { error: string }).error, "not_fit");
});

test("FIT: unsupported sports and too-short sessions are skipped, not guessed", () => {
  assert.deepEqual(decodeFitActivity(fitActivity({ sport: "walking" })), { ok: false, error: "no_session" });
  assert.deepEqual(decodeFitActivity(fitActivity({ seconds: 10 })), { ok: false, error: "no_session" });
});

test("FIT: manufacturer 'strava' marks the file Strava-origin", () => {
  const result = decodeFitActivity(fitActivity({ manufacturer: "strava" }));
  assert.ok(result.ok);
  assert.equal(result.activities[0].stravaMarked, true);
  assert.match(result.activities[0].workout.notes!, /Original source: STRAVA/);
});

test("FIT: the same file always yields the same external id (re-import updates, not duplicates)", () => {
  const a = decodeFitActivity(fitActivity()), b = decodeFitActivity(fitActivity());
  assert.ok(a.ok && b.ok);
  assert.equal(a.activities[0].workout.externalId, b.activities[0].workout.externalId);
});

// ------------------------------------------------------------------ sniffing
test("sniffUpload classifies by bytes, not by name", () => {
  assert.equal(sniffUpload(fitActivity()), "fit");
  assert.equal(sniffUpload(Uint8Array.from([0x50, 0x4b, 0x03, 0x04, 0, 0])), "zip");
  assert.equal(sniffUpload(new TextEncoder().encode(tcxDoc(twoLapRun()))), "tcx");
  assert.equal(sniffUpload(new TextEncoder().encode("﻿" + tcxDoc(twoLapRun()))), "tcx");
  assert.equal(sniffUpload(new TextEncoder().encode(`<?xml version="1.0"?><HealthData/>`)), "xml");
  assert.equal(sniffUpload(new TextEncoder().encode(csv())), "csv");
  assert.equal(sniffUpload(Uint8Array.from([0x1f, 0x8b, 0x08, 0, 0, 0])), "binary");
  assert.equal(sniffUpload(new Uint8Array(0)), "empty");
  for (const key of ["zip", "binary", "not_activity", "unrecognized_columns", "integrity_failed"]) { assert.notEqual(uploadProblem(key, "en"), uploadProblem(key, "es")); }
});

// ------------------------------------------------------------------ streams
test("streams: dropouts, out-of-range values and unordered times are handled without inventing data", () => {
  const streams = normalizeStreams([
    { t: 2, hr: 142, power: 200 }, { t: 0, hr: 140, power: 3000 }, { t: 1, hr: 0, power: 190 }, { t: 1, hr: 150 }, { t: 3, hr: 300, power: Number.NaN },
  ])!;
  assert.deepEqual(streams.t, [0, 1, 2, 3]);                  // duplicate t=1 dropped, order fixed
  assert.deepEqual(streams.hr, [140, null, 142, null]);       // 0 bpm and 300 bpm are faults → null
  assert.deepEqual(streams.power, [null, 190, 200, null]);    // 3000 W and NaN → null
  assert.equal(streams.droppedSamples, 1); assert.equal(streams.reduced, true);
  assert.equal(normalizeStreams([{ t: 0, hr: 100 }]), null);
});

test("streams: long activities are decimated to the cap and the original count is kept", () => {
  const samples = Array.from({ length: 10_000 }, (_, i) => ({ t: i, hr: 130 }));
  const streams = normalizeStreams(samples)!;
  assert.ok(streams.t.length <= MAX_STREAM_POINTS + 1);
  assert.equal(streams.originalSampleCount, 10_000); assert.equal(streams.reduced, true);
  assert.equal(streams.t[streams.t.length - 1], 9999);
  assert.deepEqual(usableChannels(streams), ["hr"]);
});

test("streams: stored JSON is validated, not trusted", () => {
  const good = normalizeStreams([{ t: 0, hr: 120 }, { t: 1, hr: 121 }])!;
  assert.deepEqual(parseStoredStreams(JSON.stringify(good)), good);
  assert.equal(parseStoredStreams(JSON.stringify({ ...good, version: 99 })), null);
  assert.equal(parseStoredStreams(JSON.stringify({ ...good, hr: [120] })), null);
  assert.equal(parseStoredStreams(JSON.stringify({ ...good, t: [1, 0] })), null);
  assert.equal(parseStoredStreams("not json"), null);
  assert.equal(parseStoredStreams(null), null);
});
