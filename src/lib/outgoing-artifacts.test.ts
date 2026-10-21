import assert from "node:assert/strict";
import { crc32, inflateRawSync } from "node:zlib";
import test from "node:test";
import { Decoder, Stream } from "@garmin/fitsdk";
import { canonicalSession, fitFilename, type CanonicalSession } from "./canonical-session";
import { buildFitWorkout, fitWorkoutName } from "./fit-export";
import { buildTrainingBundle, buildTrainingCalendar, type TrainingExportData } from "./training-export";
import { buildZip } from "./zip";

/**
 * Outgoing artifacts, each validated by something OTHER than the code that wrote it:
 *   FIT → Garmin's own decoder;  ICS → an RFC 5545 line/field check;  ZIP → an independent central-directory reader.
 * "Encodes correctly" is all this proves. It does not prove a watch accepted the file or an app imported the
 * calendar: the README and status CSV say so, and a test below keeps them from ever claiming otherwise.
 */
const NOW = new Date("2026-10-19T12:00:00Z");
const step = (extra: Record<string, unknown> = {}) => ({ name: "Work", seconds: 600, phase: "active", zone: "z2", ...extra });
function session(id: string, over: { title?: string; sport?: string; steps?: any[]; dateLocal?: string } = {}): CanonicalSession {
  const steps = over.steps ?? [step({ phase: "warmup", zone: "z1" }), step({ zone: "z4", seconds: 300 }), step({ phase: "cooldown", zone: "z1" })];
  const sport = over.sport ?? "run";
  return canonicalSession({
    athleteId: "athlete-a", workout: { id, userId: "athlete-a", sport, title: over.title ?? "Easy run", durationMin: 25 },
    prescription: { sport, durationMin: steps.reduce((n: number, s: any) => n + (s.seconds || 0), 0) / 60, verdict: "full", steps },
    profile: {}, dateLocal: over.dateLocal ?? "2026-10-20", timezone: "America/New_York",
  });
}
function exportData(sessions: CanonicalSession[], extra: Partial<TrainingExportData> = {}): TrainingExportData {
  const rows = sessions.map((s, i) => ({ id: s.id, date: new Date(`${s.dateLocal}T12:00:00Z`), title: s.title, sport: s.sport, durationMin: s.durationMin, startTime: i === 0 ? "07:30" : undefined, feedbackStatus: null as string | null }));
  return {
    athlete: { name: "Example Athlete", email: "athlete-a@example.invalid", timezone: "America/New_York", language: "en" },
    workouts: [], metrics: [], sleep: [], checkins: [],
    plan: { name: "Plan, with; punctuation", days: rows.map((row, i) => ({ date: row.date, week: 1, dayOff: false, sessions: [row] })) },
    resolvedSessions: Object.fromEntries(sessions.map(s => [s.id, s])), ...extra,
  };
}

// ----------------------------------------------------------------------------------------------- ICS
const unfold = (ics: string) => ics.replace(/\r\n[ \t]/g, "");
const unescapeText = (v: string) => v.replace(/\\n/g, "\n").replace(/\\([,;\\])/g, "$1");
function events(ics: string) {
  return unfold(ics).split("\r\n").reduce<string[][]>((acc, line) => {
    if (line === "BEGIN:VEVENT") acc.push([]); else if (line !== "END:VEVENT" && acc.length && !/^END:VCALENDAR/.test(line)) acc[acc.length - 1].push(line); return acc;
  }, []);
}
const prop = (ev: string[], name: string) => ev.find(l => l.startsWith(`${name}:`) || l.startsWith(`${name};`));

test("ICS is a structurally valid RFC 5545 calendar", () => {
  const long = "Tempo " + "intervals with a very long title ".repeat(6) + "🏁 café";
  const data = exportData([session("s-1", { title: long }), session("s-2", { title: "Hills, strides; and \\ slashes", dateLocal: "2026-10-21" })]);
  const ics = buildTrainingCalendar(data);
  assert.ok(ics.endsWith("\r\n"));
  assert.ok(!/(?<!\r)\n/.test(ics), "every line break must be CRLF");
  const physical = ics.split("\r\n");
  for (const line of physical) assert.ok(Buffer.byteLength(line, "utf8") <= 75, `line exceeds 75 octets: ${line.slice(0, 40)}…`);
  assert.ok(!ics.includes("�"), "folding must not split a UTF-8 code point");
  const lines = unfold(ics).split("\r\n").filter(Boolean);
  assert.deepEqual([lines[0], lines[1], lines[lines.length - 1]], ["BEGIN:VCALENDAR", "VERSION:2.0", "END:VCALENDAR"]);
  assert.equal(lines.filter(l => l === "BEGIN:VEVENT").length, lines.filter(l => l === "END:VEVENT").length);
  const evs = events(ics);
  assert.equal(evs.length, 2);
  for (const ev of evs) for (const required of ["UID", "DTSTAMP", "DTSTART", "SUMMARY", "DESCRIPTION"]) assert.ok(prop(ev, required), `${required} missing`);
  assert.equal(new Set(evs.map(ev => prop(ev, "UID"))).size, 2, "UIDs are unique per session");
  assert.match(prop(evs[0], "UID")!, /^UID:s-1@jasmiamimethod$/);
  // Text escaping round-trips, including commas, semicolons, backslashes and non-ASCII.
  assert.equal(unescapeText(prop(evs[0], "SUMMARY")!.slice("SUMMARY:".length)), session("s-1", { title: long }).title);
  assert.equal(unescapeText(prop(evs[1], "SUMMARY")!.slice("SUMMARY:".length)), session("s-2", { title: "Hills, strides; and \\ slashes" }).title);
  assert.equal(unescapeText(unfold(ics).split("\r\n").find(l => l.startsWith("X-WR-CALNAME:"))!.slice("X-WR-CALNAME:".length)), "Plan, with; punctuation");
});

test("ICS timing: a known start is a UTC instant with the right end; an unknown start is an all-day placeholder, not a fabricated time", () => {
  const ics = buildTrainingCalendar(exportData([session("s-1"), session("s-2", { dateLocal: "2026-10-21" })]));
  const [timed, undated] = events(ics);
  // 07:30 America/New_York on 2026-10-20 (EDT, UTC-4) is 11:30Z; the 25-minute session ends 11:55Z.
  assert.equal(prop(timed, "DTSTART"), "DTSTART:20261020T113000Z");
  assert.equal(prop(timed, "DTEND"), "DTEND:20261020T115500Z");
  assert.equal(prop(undated, "DTSTART;VALUE=DATE"), "DTSTART;VALUE=DATE:20261021");
  assert.equal(prop(undated, "DTEND;VALUE=DATE"), "DTEND;VALUE=DATE:20261022");   // exclusive end per RFC 5545
  assert.match(unescapeText(prop(undated, "DESCRIPTION")!), /Start time is not set\. This all-day entry is a scheduling placeholder, not an all-day workout\./);
  assert.doesNotMatch(unescapeText(prop(timed, "DESCRIPTION")!), /Start time is not set/);
});

test("ICS omits skipped, zero-length and rest sessions and never claims it syncs or delivers to a device", () => {
  const rest = { ...session("s-rest"), verdict: "rest" as const };
  const data = exportData([session("s-1"), session("s-skipped", { dateLocal: "2026-10-21" }), rest, session("s-zero", { dateLocal: "2026-10-23" })]);
  data.plan!.days[1].sessions[0].feedbackStatus = "skipped";
  data.plan!.days[3].sessions[0].durationMin = 0;
  const ics = buildTrainingCalendar(data);
  const uids = events(ics).map(ev => prop(ev, "UID"));
  assert.deepEqual(uids, ["UID:s-1@jasmiamimethod"]);
  assert.match(unfold(ics), /does not auto-sync/);
  assert.doesNotMatch(unfold(ics), /athlete-a@example|delivered to (your )?(watch|device)|synced to (your )?(watch|device)/i);
});

// ----------------------------------------------------------------------------------------------- ZIP
interface ZipFile { name: string; method: number; crc: number; data: Buffer }
/** Independent reader: walks the central directory, then cross-checks each local header and CRC-32. */
function readZip(bytes: Uint8Array): ZipFile[] {
  const buf = Buffer.from(bytes);
  let eocd = -1;
  for (let i = buf.length - 22; i >= 0; i--) if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  assert.ok(eocd >= 0, "end-of-central-directory record not found");
  const count = buf.readUInt16LE(eocd + 10), cdSize = buf.readUInt32LE(eocd + 12), cdOffset = buf.readUInt32LE(eocd + 16);
  assert.equal(cdOffset + cdSize, eocd, "central directory must end where the EOCD begins");
  assert.equal(buf.readUInt16LE(eocd + 8), count);
  const files: ZipFile[] = [];
  let p = cdOffset;
  for (let i = 0; i < count; i++) {
    assert.equal(buf.readUInt32LE(p), 0x02014b50, "central header signature");
    const method = buf.readUInt16LE(p + 10), crc = buf.readUInt32LE(p + 16), csize = buf.readUInt32LE(p + 20), usize = buf.readUInt32LE(p + 24);
    const nameLen = buf.readUInt16LE(p + 28), extraLen = buf.readUInt16LE(p + 30), commentLen = buf.readUInt16LE(p + 32), local = buf.readUInt32LE(p + 42);
    const name = buf.subarray(p + 46, p + 46 + nameLen).toString("utf8");
    assert.equal(buf.readUInt32LE(local), 0x04034b50, `local header signature for ${name}`);
    const lNameLen = buf.readUInt16LE(local + 26), lExtraLen = buf.readUInt16LE(local + 28);
    assert.equal(buf.subarray(local + 30, local + 30 + lNameLen).toString("utf8"), name, "local and central names agree");
    assert.equal(buf.readUInt32LE(local + 14), crc, "local and central CRC agree");
    const start = local + 30 + lNameLen + lExtraLen;
    const raw = buf.subarray(start, start + csize);
    const data = method === 0 ? raw : method === 8 ? inflateRawSync(raw) : (() => { throw new Error(`unsupported method ${method}`); })();
    assert.equal(data.length, usize, `size of ${name}`);
    assert.equal(crc32(data), crc, `CRC-32 of ${name}`);
    files.push({ name, method, crc, data: Buffer.from(data) });
    p += 46 + nameLen + extraLen + commentLen;
  }
  assert.equal(p, cdOffset + cdSize);
  return files;
}

test("ZIP builder output passes an independent integrity read (names, sizes, CRC-32, offsets)", () => {
  const entries = [{ name: "a.txt", data: "hello" }, { name: "dir/b.bin", data: Uint8Array.from([0, 1, 2, 255]) }, { name: "ünï.csv", data: "x" }];
  const files = readZip(buildZip(entries, new Date("2026-10-19T12:00:00Z")));
  assert.deepEqual(files.map(f => f.name), ["a.txt", "dir/b.bin", "ünï.csv"]);
  assert.equal(files[0].data.toString(), "hello");
  assert.deepEqual([...files[1].data], [0, 1, 2, 255]);
  assert.throws(() => buildZip([{ name: "/abs", data: "x" }]));
  assert.throws(() => buildZip([{ name: "back\\slash", data: "x" }]));
  assert.throws(() => buildZip([{ name: "", data: "x" }]));
});

test("the training bundle is a valid ZIP whose FIT files decode, match their status rows and never claim device delivery", () => {
  const ready = session("s-1", { title: "Intervals" });
  const rest = { ...session("s-2", { dateLocal: "2026-10-21" }), verdict: "rest" as const, reason: "Rest day has no workout to export." };
  const files = readZip(buildTrainingBundle(exportData([ready, rest]), NOW));
  const names = files.map(f => f.name);
  for (const expected of ["README.txt", "analytics-summary.csv", "training-plan.csv", "training-history.csv", "daily-metrics.csv", "sleep.csv", "checkins.csv", "training-calendar.ics", "fit-export-status.csv"]) assert.ok(names.includes(expected), expected);
  assert.equal(new Set(names).size, names.length, "no duplicate entry names");
  assert.ok(names.every(n => !n.startsWith("/") && !n.includes("..") && !n.includes("\\")));

  // Exactly one FIT: the ready session. Rest/held sessions export nothing.
  const fits = files.filter(f => f.name.startsWith("fit/") && f.name.endsWith(".fit"));
  assert.equal(fits.length, 1);
  assert.equal(fits[0].name, `fit/${fitFilename(ready)}`);
  const decoder = new Decoder(Stream.fromByteArray(fits[0].data));
  assert.equal(decoder.isFIT(), true);
  assert.equal(decoder.checkIntegrity(), true);
  const { messages, errors } = decoder.read() as { messages: any; errors: unknown[] };
  assert.deepEqual(errors, []);
  assert.equal(messages.fileIdMesgs[0].type, "workout");
  assert.equal(messages.workoutMesgs[0].wktName, fitWorkoutName(ready));   // identity carries the revision

  const status = files.find(f => f.name === "fit-export-status.csv")!.data.toString().trim().split("\r\n");
  const header = status[0].split(",");
  const rows = status.slice(1).map(line => Object.fromEntries(line.split(",").map((v, i) => [header[i], v])));
  const row = (id: string) => rows.find(r => r.sessionId === id)!;
  assert.equal(row("s-1").status, "encoded-device-unverified");
  assert.equal(row("s-1").revision, ready.revision);
  assert.equal(row("s-2").status, "omitted");
  assert.ok(rows.every(r => r.status !== "delivered" && !/delivered|received|synced/i.test(r.status)));

  const readme = files.find(f => f.name === "README.txt")!.data.toString();
  assert.match(readme, /does not prove device receipt/);
  assert.match(readme, /Garmin Connect activity upload is not a workout import route/);
  assert.doesNotMatch(readme, /automatically (sent|delivered|synced)/i);
});

test("the bundle's calendar is the same valid ICS as the direct download, and CSV cells cannot run formulas", () => {
  const data = exportData([session("s-1", { title: "=HYPERLINK(\"http://x\")" })]);
  data.workouts = [{ date: new Date("2026-10-18T12:00:00Z"), completed: true, durationMin: 30, title: "=SUM(A1)", notes: "+cmd", source: "manual" }];
  const files = readZip(buildTrainingBundle(data, NOW));
  const history = files.find(f => f.name === "training-history.csv")!.data.toString();
  assert.match(history, /'=SUM\(A1\)/);
  assert.match(history, /'\+cmd/);
  const bundledIcs = files.find(f => f.name === "training-calendar.ics")!.data.toString();
  assert.equal(events(bundledIcs).length, 1);
});

// ----------------------------------------------------------------------------------------------- FIT revisions
test("a changed workout produces a differently identified FIT, so a stale file is distinguishable on the device", () => {
  const a = session("s-1"), b = session("s-1", { steps: [step({ phase: "warmup", zone: "z1" }), step({ zone: "z4", seconds: 360 }), step({ phase: "cooldown", zone: "z1" })] });
  assert.notEqual(a.revision, b.revision);
  assert.notEqual(fitWorkoutName(a), fitWorkoutName(b));
  assert.equal(fitWorkoutName(a), fitWorkoutName(session("s-1")));        // same content → same identity (idempotent re-export)
  const nameOf = (s: CanonicalSession) => (new Decoder(Stream.fromByteArray(buildFitWorkout(s, NOW))).read().messages as any).workoutMesgs[0].wktName;
  assert.equal(nameOf(a), fitWorkoutName(a));
  assert.equal(nameOf(b), fitWorkoutName(b));
});
