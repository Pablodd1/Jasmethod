import test from "node:test";
import assert from "node:assert/strict";
import { Decoder, Stream } from "@garmin/fitsdk";
import { createOAuthState, validOAuthState } from "./oauth-state";
import { buildTrainingBundle, buildTrainingCalendar, toCsv } from "./training-export";

function zipFiles(zip: Uint8Array) {
  const bytes = Buffer.from(zip);
  const files = new Map<string, Buffer>();
  let offset = 0;
  while (bytes.readUInt32LE(offset) === 0x04034b50) {
    assert.equal(bytes.readUInt16LE(offset + 8), 0, "ZIP entry is stored");
    const size = bytes.readUInt32LE(offset + 18);
    const nameSize = bytes.readUInt16LE(offset + 26);
    const extraSize = bytes.readUInt16LE(offset + 28);
    const nameStart = offset + 30;
    const dataStart = nameStart + nameSize + extraSize;
    const name = bytes.subarray(nameStart, nameStart + nameSize).toString("utf8");
    files.set(name, bytes.subarray(dataStart, dataStart + size));
    offset = dataStart + size;
  }
  assert.equal(bytes.readUInt32LE(offset), 0x02014b50, "central directory follows files");
  return files;
}

const sample = {
  athlete: { name: "Test Athlete", email: "test@example.com", timezone: "America/New_York" },
  profile: { lthr: 170, ftp: 250 },
  workouts: [
    {
      id: "past-1",
      date: new Date("2026-09-01T10:00:00Z"),
      sport: "run",
      title: "Completed run",
      type: "endurance",
      durationMin: 45,
      completed: true,
      source: "strava",
    },
  ],
  metrics: [{ date: new Date("2026-09-01T04:00:00Z"), hrv: 52, source: "whoop" }],
  sleep: [],
  checkins: [],
  plan: {
    name: "Race plan",
    days: [
      {
        id: "day-1",
        date: new Date("2026-09-08T04:00:00Z"),
        week: 1,
        dayOff: false,
        sessions: [
          {
            id: "session-1",
            date: new Date("2026-09-08T04:00:00Z"),
            startTime: "07:30",
            sport: "bike",
            title: "Threshold bike",
            type: "threshold",
            durationMin: 60,
            intensity: "z4",
            completed: false,
          },
        ],
      },
    ],
  },
};

test("WHOOP OAuth state uses its required length and rejects altered responses", () => {
  const whoop = createOAuthState("whoop");
  const google = createOAuthState("google-cal");
  assert.equal(whoop.length, 8);
  assert.equal(google.length, 64);
  assert.equal(validOAuthState(whoop, whoop, "whoop"), true);
  assert.equal(validOAuthState(`${whoop.slice(0, 7)}x`, whoop, "whoop"), false);
  assert.equal(validOAuthState(google, google, "google-cal"), true);
  assert.equal(validOAuthState(whoop, whoop, "google-cal"), false);
});

test("CSV quotes unsafe cells and calendar emits a timed workout", () => {
  assert.equal(toCsv([{ note: 'a,"b"' }], ["note"]), 'note\r\n"a,""b"""\r\n');
  const calendar = buildTrainingCalendar(sample);
  assert.match(calendar, /DTSTART:20260908T113000Z/);
  assert.match(calendar, /DTEND:20260908T123000Z/);
  assert.match(calendar, /SUMMARY:Threshold bike/);
});

test("complete training bundle contains analytics, calendar and valid FIT", () => {
  const zip = buildTrainingBundle(sample, new Date("2026-09-07T12:00:00Z"));
  const files = zipFiles(zip);
  for (const name of [
    "README.txt",
    "analytics-summary.csv",
    "training-plan.csv",
    "training-history.csv",
    "daily-metrics.csv",
    "sleep.csv",
    "checkins.csv",
    "training-calendar.ics",
  ])
    assert.ok(files.has(name), name);
  assert.match(files.get("training-history.csv")!.toString(), /Completed run/);
  assert.match(files.get("daily-metrics.csv")!.toString(), /whoop/);
  const fit = Array.from(files).find(([name]) => name.endsWith(".fit"));
  assert.ok(fit);
  const decoder = new Decoder(Stream.fromByteArray(fit![1]));
  assert.equal(decoder.checkIntegrity(), true);
  const { messages, errors } = decoder.read();
  assert.deepEqual(errors, []);
  assert.equal((messages as any).workoutMesgs[0].wktName, "Threshold bike");
});
