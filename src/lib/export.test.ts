import test from "node:test";
import assert from "node:assert/strict";
import { Decoder, Stream } from "@garmin/fitsdk";
import { createOAuthState, validOAuthState } from "./oauth-state";
import { canonicalSession } from "./canonical-session";
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
  const session = sample.plan.days[0].sessions[0];
  const canonical = canonicalSession({ athleteId: "test", workout: session, prescription: { durationMin: 60, steps: [{ name: "Threshold", seconds: 3600, zone: "z4", phase: "active" }] }, profile: sample.profile, dateLocal: "2026-09-08", timezone: sample.athlete.timezone });
  const zip = buildTrainingBundle({ ...sample, resolvedSessions: { [session.id]: canonical } }, new Date("2026-09-07T12:00:00Z"));
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
  assert.match((messages as any).workoutMesgs[0].wktName, /^JMM-[a-f0-9]{10} Threshold bike$/);
});


test("bundle omits unresolved/raw, rest, malformed and unsupported sessions with honest reasons", () => {
  const unresolved = zipFiles(buildTrainingBundle(sample));
  assert.equal([...unresolved.keys()].some(name => name.endsWith(".fit")), false);
  assert.match(unresolved.get("fit-export-status.csv")!.toString(), /No authenticated current safety/);
  const session = sample.plan.days[0].sessions[0];
  for (const extra of [{ profile: { injured: true }, prescription: null }, { profile: {}, prescription: "{" }, { profile: {}, prescription: JSON.stringify({ verdict: "rest" }) }]) {
    const c = canonicalSession({ athleteId: "test", workout: session, ...extra, dateLocal: "2026-09-08", timezone: sample.athlete.timezone });
    const files = zipFiles(buildTrainingBundle({ ...sample, resolvedSessions: { [session.id]: c } }));
    assert.equal([...files.keys()].some(name => name.endsWith(".fit")), false);
    assert.match(files.get("fit-export-status.csv")!.toString(), /omitted/);
  }
});


test("CSV treats untrusted formula-like strings as text while preserving numeric values", () => {
  assert.equal(toCsv([{ note: "=HYPERLINK(1)", delta: -5 }], ["note", "delta"]), "note,delta\r\n'=HYPERLINK(1),-5\r\n");
});
