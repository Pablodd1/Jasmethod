import { test } from "node:test";
import assert from "node:assert/strict";
import { GARMIN_FILE_MAX_BYTES, parseGarminFile, type GarminFileInput } from "./garmin-file-import";

const opts = { timezone: "America/New_York", unitSystem: "metric", numberFormat: "decimal-dot", now: new Date("2026-12-01T00:00:00Z") } as const;
const header = "Activity Type,Date,Title,Distance,Time,Avg HR,Max HR,Calories,Activity ID";
const row = "Running,2026-07-01 08:30:00,Morning run,5.25,00:30:30,140,165,300,12345";
const csv = (text = `${header}\n${row}`, options: Partial<GarminFileInput> = {}) => parseGarminFile({ filename: "Activities.csv", content: text, ...opts, ...options });
const codes = (result: ReturnType<typeof parseGarminFile>) => result.diagnostics.map(d => d.code);
const lap = (start = "2026-07-01T12:30:00Z", seconds = "600", distance = "2000", other = "") => `<Lap StartTime="${start}"><TotalTimeSeconds>${seconds}</TotalTimeSeconds><DistanceMeters>${distance}</DistanceMeters>${other}</Lap>`;
const xml = (laps = lap(), sport = "Running", id = "2026-07-01T12:30:00Z") => `<?xml version="1.0"?><TrainingCenterDatabase xmlns="http://www.garmin.com/xmlschemas/TrainingCenterDatabase/v2"><Activities><Activity Sport="${sport}"><Id>${id}</Id>${laps}</Activity></Activities></TrainingCenterDatabase>`;
const tcx = (text = xml(), options: Partial<GarminFileInput> = {}) => parseGarminFile({ filename: "activity.tcx", content: text, ...opts, ...options });

test("EN metric Activities CSV keeps precise duration, Garmin provenance and explicit provider identity", () => {
  const result = csv();
  assert.equal(result.fatal, false);
  assert.equal(result.workouts.length, 1);
  const w = result.workouts[0];
  assert.equal(w.date.toISOString(), "2026-07-01T12:30:00.000Z");
  assert.equal(w.durationMin, 31);
  assert.equal(w.sourceDurationSeconds, 1830);
  assert.ok(codes(result).includes("DURATION_ROUNDED"));
  assert.equal(w.distanceKm, 5.25);
  assert.equal(w.source, "garmin");
  assert.equal(w.externalId, "garmin-file:id:12345");
  assert.equal(w.sourceId, "12345");
  assert.equal(w.identity, "provider-id");
  assert.equal(result.coverage.completeArchive, false);
  assert.deepEqual(result.coverage, { start: w.date.toISOString(), end: w.date.toISOString(), accepted: 1, completeArchive: false });
  assert.ok(codes(result).includes("PARTIAL_HISTORY"));
});

test("Spanish known Activities headers and decimal-comma format normalize safely", () => {
  const result = csv('Tipo de actividad,Fecha,Título,Distancia,Tiempo,FC media,FC máxima,Calorías,ID de actividad\nCarrera,2026-07-01 08:30:00,Carrera matinal,"5,25",00:30:30,140,165,300,12345', { numberFormat: "decimal-comma", timezone: "Europe/Madrid" });
  assert.equal(result.workouts[0].sport, "run");
  assert.equal(result.workouts[0].distanceKm, 5.25);
  assert.equal(result.workouts[0].date.toISOString(), "2026-07-01T06:30:00.000Z");
});

test("imperial CSV uses miles without relabeling as kilometers", () => {
  const result = csv(`${header}\n${row}`, { unitSystem: "imperial" });
  assert.equal(result.workouts[0].distanceKm, 5.25 * 1.609344);
});

test("unlabeled swimming requires separate unit even for metric exports", () => {
  const result = csv(`${header}\n${row.replace("Running", "Pool Swimming").replace("5.25", "1500")}`);
  assert.equal(result.workouts.length, 0);
  assert.equal(result.rejectedRecords, 1);
  assert.ok(codes(result).includes("SWIM_DISTANCE_UNIT_REQUIRED"));
});

test("explicit swimming meters/yards and explicit per-cell km/mi are honored without magnitude heuristics", () => {
  const input = `${header}\n${row.replace("Running", "Natación en piscina").replace("5.25", "1500")}`;
  assert.equal(csv(input, { swimDistanceUnit: "m" }).workouts[0].distanceKm, 1.5);
  assert.equal(csv(input, { swimDistanceUnit: "yd", unitSystem: "imperial" }).workouts[0].distanceKm, 1500 * 0.0009144);
  assert.equal(csv(input.replace(",1500,", ",1.5 km,")).workouts[0].distanceKm, 1.5);
  assert.equal(csv(input.replace(",1500,", ",1 mi,")).workouts[0].distanceKm, 1.609344);
});

test("distance header units override selected system and conflicting explicit cell units reject", () => {
  const text = `${header.replace("Distance", "Distance (m)")}\n${row.replace("5.25", "5000")}`;
  assert.equal(csv(text, { unitSystem: "imperial" }).workouts[0].distanceKm, 5);
  assert.ok(codes(csv(text.replace(",5000,", ",5 km,"))).includes("CONFLICTING_DISTANCE_UNITS"));
});

test("quoted commas, escaped quotes, CRLF, embedded newlines and UTF8 BOM work", () => {
  const result = csv(`\uFEFF${header}\r\n${row.replace("Morning run", '"Morning, \"\"tempo\"\"\nrun"')}\r\n`);
  assert.equal(result.workouts.length, 1);
  assert.equal(result.workouts[0].title, 'Morning, "tempo" run');
});

test("strict CSV parser rejects unterminated quotes and unexpected text after closing quote", () => {
  for (const bad of [`${header}\n"${row}`, `${header}\n${row.replace("Morning run", '"Morning"x')}`]) {
    const result = csv(bad);
    assert.equal(result.fatal, true);
    assert.equal(result.workouts.length, 0);
    assert.ok(codes(result).includes("MALFORMED_CSV"));
  }
});

test("report16 and arbitrary report schemas are not guessed into activities", () => {
  for (const content of ["Date,Distance,Time\n2026-07,100,10:00:00", "Activity Type,Date,Distance,Time\nRunning,2026-07-01,100,10:00:00", "Period,Running,Cycling\nJuly,100,200"]) {
    const result = csv(content, { filename: "report16.csv" });
    assert.equal(result.fatal, true);
    assert.ok(codes(result).includes("UNSUPPORTED_CSV_SCHEMA"));
  }
});

test("timezone and unit system are required and runtime-invalid options rejected", () => {
  assert.ok(codes(csv(undefined, { timezone: undefined })).includes("TIMEZONE_REQUIRED"));
  assert.ok(codes(csv(undefined, { unitSystem: undefined })).includes("UNIT_SYSTEM_REQUIRED"));
  for (const timezone of ["Not/A_Zone", "EST", "+02:00"]) assert.ok(codes(csv(undefined, { timezone })).includes("INVALID_TIMEZONE"));
  assert.ok(codes(csv(undefined, { distanceUnit: "ft" as never })).includes("INVALID_DISTANCE_UNIT"));
  assert.ok(codes(csv(undefined, { numberFormat: "guess" as never })).includes("INVALID_NUMBER_FORMAT"));
});

test("DST gap and overlap are rejected; explicit offset resolves overlap", () => {
  const gap = csv(`${header}\n${row.replace("2026-07-01 08:30:00", "2026-03-08 02:30:00")}`);
  const overlap = csv(`${header}\n${row.replace("2026-07-01 08:30:00", "2026-11-01 01:30:00")}`);
  assert.ok(codes(gap).includes("LOCAL_TIME_NONEXISTENT"));
  assert.ok(codes(overlap).includes("LOCAL_TIME_AMBIGUOUS"));
  const explicit = csv(`${header}\n${row.replace("2026-07-01 08:30:00", "2026-11-01T01:30:00-04:00")}`);
  assert.equal(explicit.workouts[0].date.toISOString(), "2026-11-01T05:30:00.000Z");
});

test("half-hour DST overlap is also rejected and UTC/fractional seconds are stable", () => {
  const overlap = csv(`${header}\n${row.replace("2026-07-01 08:30:00", "2026-04-05 01:45:00")}`, { timezone: "Australia/Lord_Howe" });
  assert.ok(codes(overlap).includes("LOCAL_TIME_AMBIGUOUS"));
  const utc = csv(`${header}\n${row.replace("2026-07-01 08:30:00", "2026-07-01 08:30:00.125")}`, { timezone: "UTC" });
  assert.equal(utc.workouts[0].date.toISOString(), "2026-07-01T08:30:00.125Z");
});

test("malformed calendar dates, timezone offsets and locale-ambiguous dates are rejected", () => {
  for (const date of ["2026-02-30 08:30:00", "2026-13-01 08:30:00", "2026-07-01 24:00:00", "2026-07-01T08:30:00+99:00", "2026-07-01T08:30:60Z", "01/07/2026 08:30:00", "2026-07-01"]) {
    const result = csv(`${header}\n${row.replace("2026-07-01 08:30:00", date)}`);
    assert.equal(result.workouts.length, 0, date);
    assert.equal(result.rejectedRecords, 1, date);
  }
});

test("decimal separators require explicit format and strict grouping rejects junk", () => {
  assert.ok(codes(csv(undefined, { numberFormat: undefined })).includes("NUMBER_FORMAT_REQUIRED"));
  assert.equal(csv(`${header}\n${row.replace("5.25", '"1,234.50"')}`).workouts[0].distanceKm, 1234.5);
  assert.equal(csv(`${header}\n${row.replace("5.25", '"1.234,50"')}`, { numberFormat: "decimal-comma" }).workouts[0].distanceKm, 1234.5);
  for (const value of ["5junk", "Infinity", "NaN", "-5", "1e3", '"1,23"', '"1.2.3"']) {
    const result = csv(`${header}\n${row.replace("5.25", value)}`);
    assert.equal(result.rejectedRecords, 1, value);
  }
});

test("duration syntax is strict, rounding disclosed and invalid optional metrics reject row", () => {
  for (const time of ["30:30", "00:60:00", "00:30:60", "00:00:00", "-1:00:00", "00:30:00junk"]) assert.equal(csv(`${header}\n${row.replace("00:30:30", time)}`).rejectedRecords, 1, time);
  assert.equal(csv(`${header}\n${row.replace("00:30:30", "00:00:00.500")}`).workouts[0].durationMin, 1);
  assert.equal(csv(`${header}\n${row.replace("00:30:30", "00:00:00.500")}`).workouts[0].sourceDurationSeconds, 0.5);
  assert.equal(csv(`${header}\n${row.replace(",140,165,", ",170,165,")}`).rejectedRecords, 1);
  assert.equal(csv(`${header}\n${row.replace(",140,", ",140junk,")}`).rejectedRecords, 1);
});

test("walking, hiking and unmapped sports stay other; Spanish cycling is bike", () => {
  for (const type of ["Walking", "Caminar", "Hiking"]) {
    const result = csv(`${header}\n${row.replace("Running", type)}`);
    assert.equal(result.workouts[0].sport, "other");
    assert.ok(codes(result).includes("SPORT_OTHER"));
  }
  assert.equal(csv(`${header}\n${row.replace("Running", "Ciclismo")}`).workouts[0].sport, "bike");
});

test("stable fallback identities ignore title and normalize timestamp offsets across formats", () => {
  const noId = `${header}\n${row.replace(",12345", ",")}`;
  const first = csv(noId).workouts[0], renamed = csv(noId.replace("Morning run", "Changed title")).workouts[0];
  assert.equal(first.identity, "start-sport");
  assert.equal(first.externalId, renamed.externalId);
  assert.equal(first.externalId, tcx().workouts[0].externalId);
  const offset = csv(noId.replace("2026-07-01 08:30:00", "2026-07-01T14:30:00+02:00")).workouts[0];
  assert.equal(first.externalId, offset.externalId);
});

test("duplicates are counted, conflicting identical IDs reject both, and partial records are explicit", () => {
  const duplicate = csv(`${header}\n${row}\n${row}`);
  assert.equal(duplicate.totalRecords, 2);
  assert.equal(duplicate.workouts.length, 1);
  assert.equal(duplicate.skippedRecords, 1);
  const conflict = csv(`${header}\n${row}\n${row.replace("5.25", "10.25")}`);
  assert.equal(conflict.workouts.length, 0);
  assert.equal(conflict.rejectedRecords, 2);
  assert.ok(codes(conflict).includes("CONFLICTING_IDENTITY"));
  const partial = csv(`${header}\n${row}\n${row.replace("2026-07-01", "2026-02-30")}`);
  assert.equal(partial.fatal, false);
  assert.equal(partial.workouts.length, 1);
  assert.equal(partial.rejectedRecords, 1);
});

test("blank metrics stay absent and zero distance is retained", () => {
  const result = csv(`${header}\nRunning,2026-07-01 08:30:00,Indoor,0,00:10:00,--,—,,`);
  assert.equal(result.workouts[0].distanceKm, 0);
  assert.equal(result.workouts[0].avgHr, undefined);
  assert.equal(result.workouts[0].calories, undefined);
});

test("CSV duplicate semantic columns, mismatched cells and future activities reject", () => {
  assert.ok(codes(csv(`${header},Fecha\n${row},2026-07-01`)).includes("DUPLICATE_HEADER"));
  assert.ok(codes(csv(`${header}\n${row},extra`)).includes("COLUMN_COUNT_MISMATCH"));
  assert.ok(codes(csv(undefined, { now: new Date("2026-06-01T00:00:00Z") })).includes("FUTURE_ACTIVITY"));
});

test("TCX lap sums preserve recorded elapsed duration, distance, calories and weighted HR", () => {
  const metrics = (avg: number, max: number, calories: number) => `<AverageHeartRateBpm><Value>${avg}</Value></AverageHeartRateBpm><MaximumHeartRateBpm><Value>${max}</Value></MaximumHeartRateBpm><Calories>${calories}</Calories>`;
  const result = tcx(xml(lap(undefined, "600", "2000", metrics(120, 150, 100)) + lap("2026-07-01T12:45:00Z", "1200", "4000", metrics(150, 170, 200))));
  const w = result.workouts[0];
  assert.equal(w.durationMin, 30);
  assert.equal(w.distanceKm, 6);
  assert.equal(w.calories, 300);
  assert.equal(w.avgHr, 140);
  assert.equal(w.maxHr, 170);
});

test("TCX ignores cumulative trackpoint distance and timer pauses instead of inventing totals", () => {
  const result = tcx(xml(lap(undefined, "300", "1000", '<Track><Trackpoint><Time>2026-07-01T12:30:00Z</Time><DistanceMeters>9999</DistanceMeters></Trackpoint><Trackpoint><Time>2026-07-01T13:30:00Z</Time><DistanceMeters>19999</DistanceMeters></Trackpoint></Track>')));
  assert.equal(result.workouts[0].durationMin, 5);
  assert.equal(result.workouts[0].distanceKm, 1);
  assert.equal(result.workouts[0].avgHr, undefined);
});

test("TCX namespaces accepted; missing required lap fields and invalid dates rejected", () => {
  const prefixed = xml().replace(/<(\/?)(TrainingCenterDatabase|Activities|Activity|Id|Lap|TotalTimeSeconds|DistanceMeters)(?=[ >])/g, "<$1tcx:$2").replace('xmlns="', 'xmlns:tcx="');
  assert.equal(tcx(prefixed).workouts.length, 1);
  for (const content of [xml().replace("<DistanceMeters>2000</DistanceMeters>", ""), xml().replace("<TotalTimeSeconds>600</TotalTimeSeconds>", "<TotalTimeSeconds>600bad</TotalTimeSeconds>"), xml(lap(), "Running", "2026-02-30T12:30:00Z"), xml(lap(), "Running", "2026-07-01T12:30:00")]) assert.equal(tcx(content).rejectedRecords, 1);
});

test("TCX incomplete lap optional metrics don't present partial totals as complete", () => {
  const result = tcx(xml(lap(undefined, "600", "2000", "<Calories>100</Calories>") + lap("2026-07-01T12:40:00Z")));
  assert.equal(result.workouts[0].calories, undefined);
  assert.ok(codes(result).includes("INCOMPLETE_TCX_METRICS"));
});

test("TCX XML entities, malformed XML, excessive nesting, courses and future activities reject", () => {
  assert.ok(codes(tcx('<!DOCTYPE TrainingCenterDatabase [<!ENTITY a "boom">]>' + xml())).includes("UNSAFE_XML"));
  assert.ok(codes(tcx(xml().replace("</Lap>", ""))).includes("MALFORMED_XML"));
  assert.ok(codes(tcx("<x>".repeat(40) + "</x>".repeat(40))).includes("XML_LIMIT"));
  assert.ok(codes(tcx("<TrainingCenterDatabase><Courses><Course/></Courses></TrainingCenterDatabase>")).includes("NO_ACTIVITIES"));
  assert.ok(codes(tcx(undefined, { now: new Date("2026-01-01T00:00:00Z") })).includes("FUTURE_ACTIVITY"));
});

test("FIT and ZIP explicitly unsupported by extension and content signatures, even when renamed", () => {
  assert.ok(codes(csv("anything", { filename: "activity.fit" })).includes("FIT_UNSUPPORTED"));
  assert.ok(codes(csv("anything", { filename: "archive.zip" })).includes("ZIP_UNSUPPORTED"));
  assert.ok(codes(csv("PK\x03\x04rest")).includes("ZIP_UNSUPPORTED"));
  assert.ok(codes(csv("12345678.FITrest")).includes("FIT_UNSUPPORTED"));
});

test("size, binary, malformed UTF8, record/column/field limits fail closed", () => {
  assert.ok(codes(csv("x".repeat(GARMIN_FILE_MAX_BYTES + 1))).includes("FILE_TOO_LARGE"));
  assert.ok(codes(csv("abc\u0000def")).includes("BINARY_CONTENT"));
  assert.ok(codes(csv(undefined, { content: new Uint8Array([0xc3, 0x28]) })).includes("INVALID_ENCODING"));
  assert.ok(codes(csv(`${header}\n` + Array(10_001).fill(row).join("\n"))).includes("RECORD_LIMIT"));
  assert.ok(codes(csv(Array(201).fill("x").join(","))).includes("CSV_LIMIT"));
  assert.ok(codes(csv("x".repeat(16_385))).includes("CSV_LIMIT"));
});

test("integer-backed HR and calorie fields reject fractions before database storage", () => {
  for (const replacement of [[",140,", ",140.5,"], [",165,", ",165.5,"], [",300,", ",300.5,"]]) assert.ok(codes(csv(`${header}\n${row.replace(replacement[0], replacement[1])}`)).includes("INTEGER_REQUIRED"));
  assert.ok(codes(tcx(xml(lap(undefined, "600", "2000", "<Calories>100.5</Calories>")))).includes("INTEGER_REQUIRED"));
});

test("unmapped positive distances need an explicit unit, avoiding hidden swim/rowing assumptions", () => {
  const content = `${header}\n${row.replace("Running", "Rowing")}`;
  assert.ok(codes(csv(content)).includes("DISTANCE_UNIT_REQUIRED"));
  assert.equal(csv(content, { distanceUnit: "m" }).workouts[0].distanceKm, 0.00525);
  assert.equal(csv(content, { distanceUnit: "m" }).workouts[0].sport, "other");
});

test("legacy aliases retain original local CSV date/title and TCX Id for conflict-only reconciliation", () => {
  const result = csv(`${header}\n${row.replace("Morning run", '"Morning, ""tempo""\nrun"')}`);
  assert.equal(result.workouts[0].legacyExternalIds?.[0], 'garmin-csv:2026-07-01 08:30:00:Morning, "tempo"\nrun');
  assert.deepEqual(tcx().workouts[0].legacyExternalIds, ["tcx:2026-07-01T12:30:00Z"]);
});

test("TCX rejects multiple XML roots even when the underlying validator accepts them", () => {
  const result = tcx(xml() + "<UnrelatedData/>");
  assert.equal(result.fatal, true);
  assert.ok(codes(result).includes("MALFORMED_XML"));
});
