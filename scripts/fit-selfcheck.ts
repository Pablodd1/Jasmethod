// Self-check: build a FIT workout, then parse it back structurally the way the
// official FIT SDK would (header → definitions → data → CRC). Fails loudly on
// any structural violation. Run: npx tsx scripts/fit-selfcheck.ts
import { buildFitWorkout, fitCrc, STEP_INTENSITY, STEP_DURATION, WORKOUT_SPORT } from "../src/lib/fit-export";

function fail(msg: string): never { console.error(`FAIL: ${msg}`); process.exit(1); }

const bytes = buildFitWorkout({
  name: "Test Z2 Run",
  sport: WORKOUT_SPORT.running,
  steps: [
    { name: "Warm up", intensity: STEP_INTENSITY.warmup, durationType: STEP_DURATION.time, durationValue: 600 },
    { name: "Main", intensity: STEP_INTENSITY.active, durationType: STEP_DURATION.time, durationValue: 2400, targetType: 2, targetValue: 150 },
    { name: "Cool down", intensity: STEP_INTENSITY.cooldown, durationType: STEP_DURATION.time, durationValue: 600 },
  ],
});

// --- header ---
if (bytes.length < 16) fail("file too short");
if (bytes[0] !== 14) fail(`header size byte = ${bytes[0]}, expected 14`);
if (new TextDecoder().decode(bytes.slice(1, 5)) !== ".FIT") fail("header magic missing");
const dataSize = bytes[7] | (bytes[8] << 8) | (bytes[9] << 16) | (bytes[10] << 24);
if (14 + dataSize + 2 !== bytes.length) fail(`data size ${dataSize} != length math (${bytes.length})`);
const headerCrc = fitCrc(bytes, 0, 11);
if (bytes[11] !== (headerCrc & 0xff) || bytes[12] !== ((headerCrc >> 8) & 0xff)) fail("header CRC mismatch");
const fileCrc = bytes[bytes.length - 2] | (bytes[bytes.length - 1] << 8);
const computedCrc = fitCrc(bytes, 14, bytes.length - 2);
if (fileCrc !== computedCrc) fail(`file CRC mismatch: stored ${fileCrc} vs computed ${computedCrc}`);

// --- walk messages (same order rules the FIT SDK enforces) ---
let pos = 14;
let definitions = 0, dataMessages = 0, steps = 0, sawWorkoutDef = false, sawFileId = false;
const sizes = new Map<number, number>(); // local type → data-message size in bytes
while (pos < 14 + dataSize) {
  const head = bytes[pos];
  if (head & 0x80) fail("compressed-timestamp header not expected");
  const local = head & 0x0f;
  if (head & 0x40) {
    definitions++;
    const globalNum = bytes[pos + 3] | (bytes[pos + 4] << 8); // LE u16 after hdr+res+arch
    const nFields = bytes[pos + 5];
    let sz = 0;
    for (let i = 0; i < nFields; i++) sz += bytes[pos + 6 + i * 3 + 1];
    sizes.set(local, sz);
    if (globalNum === 0) sawFileId = true;
    if (globalNum === 31) sawWorkoutDef = true;
    pos += 6 + nFields * 3;
  } else {
    const sz = sizes.get(local);
    if (sz === undefined) fail(`data message with local type ${local} before its definition`);
    dataMessages++;
    if (local === 2) steps++;
    pos += 1 + sz; // 1 header byte + field bytes
  }
}
if (!sawFileId) fail("file_id (0) definition missing");
if (!sawWorkoutDef) fail("workout (31) definition missing");
if (definitions !== 3) fail(`expected 3 definitions, got ${definitions}`);
if (steps !== 3) fail(`expected 3 workout_steps, got ${steps}`);
if (dataMessages !== 5) fail(`expected 5 data messages (file_id + workout + 3 steps), got ${dataMessages}`);

console.log(`PASS: ${bytes.length} bytes, header CRC ok, file CRC ok, 3 defs, 5 data msgs, 3 steps`);
