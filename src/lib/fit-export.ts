// JasMiamiMethod — FIT workout export (Garmin/COROS compatible).
// Generates a structured-workout .FIT file per the Flexible & Interoperable
// Data Transfer (FIT) Protocol spec (developer.garmin.com/fit). On "Approve",
// the athlete downloads this file and imports it into Garmin Connect
// (Connect → Training → Workouts → Import) or COROS Training Hub
// (Training → Library → import) — both sync it to the watch automatically.
//
// Encoding per spec: little-endian, architecture bit = 0 (all values
// little-endian). File structure: header(12/14 bytes) → Definition Message →
// Data Message(s) → CRC16. Message types used: file_id (0), workout (31),
// workout_step (32). CRC is CCITT CRC-16 (poly 0x8408 reflected, init 0).
// Validated by parse-back in scripts/fit-selfcheck.cjs (see repo).

// ---------- CRC16 (FIT spec: reflected 0x8408, init 0x0000, xorout 0) ----------
const CRC_TABLE = (() => {
  const t = new Uint16Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let _ = 0; _ < 8; _++) c = c & 1 ? (c >>> 1) ^ 0x8408 : c >>> 1;
    t[i] = c;
  }
  return t;
})();

export function fitCrc(bytes: Uint8Array, start = 0, end = bytes.length, init = 0): number {
  let crc = init;
  for (let i = start; i < end; i++) crc = (crc >>> 8) ^ CRC_TABLE[(crc ^ bytes[i]) & 0xff];
  return crc;
}

// ---------- Low-level writers (little-endian, architecture=0) ----------
class ByteWriter {
  private parts: number[] = [];
  u8(v: number) { this.parts.push(v & 0xff); return this; }
  u16(v: number) { this.parts.push(v & 0xff, (v >> 8) & 0xff); return this; }
  u32(v: number) { this.parts.push(v & 0xff, (v >> 8) & 0xff, (v >> 16) & 0xff, (v >>> 24) & 0xff); return this; }
  z16(v?: number | null) { return v == null ? this.u16(0x7fff /* FIT undefined u16 */) : this.u16(v); } // invalid → 0x7FFF (u16) / 0x7FFFFFFF (u32) per spec
  z32(v?: number | null) { return v == null ? this.u32(0x7fffffff) : this.u32(v); }
  z8(v?: number | null) { return v == null ? this.u8(0x7f) : this.u8(v); }
  bytes(b: Uint8Array) { for (let i = 0; i < b.length; i++) this.parts.push(b[i] & 0xff); return this; }
  toUint8(): Uint8Array { return Uint8Array.from(this.parts); }
}

// Field definition: num, size(bytes), base_type
interface FieldDef { num: number; size: number; type: BaseType; }

// Base types (FIT spec table). value = raw base-type number in the definition.
export enum BaseType {
  ENUM = 2, S8 = 1, U8 = 0, S16 = 131, U16 = 130, S32 = 135, U32 = 134,
  STRING = 7, FLOAT32 = 136, FLOAT64 = 137, BYTE = 13,
}

// ---------- Profile: message numbers + field numbers (per FIT SDK Profile.xlsx) ----------
const MSG = { FILE_ID: 0, WORKOUT: 31, WORKOUT_STEP: 32 } as const;

// file_id (0): type(0)=4(fit|workout? 9=filetypes.workout? — 4=fitness? per spec: type ENUM filetype 4=workout), manufacturer(1), product(2), time_created(4)
const FILE_ID_FIELDS: FieldDef[] = [
  { num: 0, size: 1, type: BaseType.ENUM },   // type: 4 = workout (filetype)
  { num: 1, size: 2, type: BaseType.U16 },    // manufacturer
  { num: 2, size: 2, type: BaseType.U16 },    // product
  { num: 4, size: 4, type: BaseType.U32 },    // time_created (s since 1989-12-31)
];

// workout (31): sport(4) enum, name(8) string, num_valid_steps(9) u16
const WORKOUT_FIELDS: FieldDef[] = [
  { num: 4, size: 1, type: BaseType.ENUM },   // sport: 0=generic 1=running 2=cycling 5=swimming
  { num: 8, size: 16, type: BaseType.STRING }, // name (max 16 bytes)
  { num: 9, size: 2, type: BaseType.U16 },    // num_valid_steps
];

// workout_step (32): message_index(254) u16, wkt_step_name(3) string, duration_type(5) enum,
// duration_value(6) u32, target_type(7) enum, target_value(8) u32, intensity(10) enum
const WORKOUT_STEP_FIELDS: FieldDef[] = [
  { num: 254, size: 2, type: BaseType.U16 },  // message_index
  { num: 3, size: 16, type: BaseType.STRING }, // step name
  { num: 5, size: 1, type: BaseType.ENUM },   // duration_type: 0=open 2=time 3=distance 8=lap_button
  { num: 6, size: 4, type: BaseType.U32 },    // duration_value
  { num: 7, size: 1, type: BaseType.ENUM },   // target_type: 0=open 1=power 2=hr 4=pace
  { num: 8, size: 4, type: BaseType.U32 },    // target_value (low end of range)
  { num: 10, size: 1, type: BaseType.ENUM },  // intensity: 0=active 1=rest 2=warmup 3=cooldown
];

// Intensity enum (workout_step.intensity)
export const STEP_INTENSITY = { active: 0, rest: 1, warmup: 2, cooldown: 3 } as const;
// Duration type enum
export const STEP_DURATION = { open: 0, time: 2, distance: 3 } as const; // 2=time(seconds) 3=distance(meters)
// Target type enum
export const STEP_TARGET = { open: 0, power: 1, hr: 2, pace: 4 } as const;
// Workout sport enum (workout.sport)
export const WORKOUT_SPORT = { generic: 0, running: 1, cycling: 2, swimming: 5 } as const;

// ---------- Input shape ----------
export interface FitStep {
  name: string;                 // step label, truncated to 15 chars
  intensity: (typeof STEP_INTENSITY)[keyof typeof STEP_INTENSITY];
  durationType: (typeof STEP_DURATION)[keyof typeof STEP_DURATION]; // open/time/distance
  durationValue?: number;       // seconds or meters
  targetType?: (typeof STEP_TARGET)[keyof typeof STEP_TARGET];     // open/power/hr/pace
  targetValue?: number;         // watts | bpm | sec/km
}

export interface FitWorkoutSpec {
  name: string;                 // workout name, truncated to 15 chars
  sport: (typeof WORKOUT_SPORT)[keyof typeof WORKOUT_SPORT];
  steps: FitStep[];
}

// ---------- Definition-message builder ----------
// Per FIT spec: header(1) + reserved(1) + architecture(1, 0=little-endian)
// + global message number u16 + field count(1) + field defs (num,size,type ×3).
function buildDefinition(localMsgType: number, globalMsgNum: number, fields: FieldDef[]): Uint8Array {
  const w = new ByteWriter();
  w.u8(0x40 | localMsgType);       // definition message header
  w.u8(0);                          // reserved
  w.u8(0);                          // architecture = 0 (little-endian)
  w.u16(globalMsgNum);              // global message number
  w.u8(fields.length);              // field count
  for (const f of fields) {
    w.u8(f.num);
    w.u8(f.size);
    w.u8(f.type);
  }
  return w.toUint8();
}

// ---------- Data-message builders (all little-endian, architecture 0) ----------
function fitTime(d: Date): number {
  return Math.max(0, Math.floor(d.getTime() / 1000 - 631065600)); // FIT epoch = 1989-12-31 UTC
}

function fileIdData(local: number, created: Date): Uint8Array {
  const w = new ByteWriter();
  w.u8(local & 0x7f);      // data message header (bit7=0, local type)
  w.u8(4);                 // type = workout filetype
  w.u16(255);              // manufacturer = 255 (development)
  w.u16(255);              // product
  w.u32(fitTime(created)); // time_created
  return w.toUint8();
}

function workoutData(local: number, spec: FitWorkoutSpec): Uint8Array {
  const nameBytes = new TextEncoder().encode(spec.name.slice(0, 15));
  const w = new ByteWriter();
  w.u8(local & 0x7f);
  w.u8(spec.sport);
  const name = new Uint8Array(16); name.set(nameBytes); // pad to field size
  w.bytes(name);
  w.u16(spec.steps.length);
  return w.toUint8();
}

function stepData(local: number, step: FitStep, index: number): Uint8Array {
  const nameBytes = new TextEncoder().encode(step.name.slice(0, 15));
  const name = new Uint8Array(16); name.set(nameBytes);
  const w = new ByteWriter();
  w.u8(local & 0x7f);
  w.u16(index);
  w.bytes(name);
  w.u8(step.durationType);
  w.z32(step.durationValue ?? null);
  w.u8(step.targetType ?? STEP_TARGET.open);
  w.z32(step.targetValue ?? null);
  w.u8(step.intensity);
  return w.toUint8();
}

// ---------- File assembly ----------
export function buildFitWorkout(spec: FitWorkoutSpec, created = new Date()): Uint8Array {
  const body = new ByteWriter();

  // file_id: local 0
  body.bytes(buildDefinition(0, MSG.FILE_ID, FILE_ID_FIELDS));
  body.bytes(fileIdData(0, created));

  // workout: local 1
  body.bytes(buildDefinition(1, MSG.WORKOUT, WORKOUT_FIELDS));
  body.bytes(workoutData(1, spec));

  // workout_step: local 2 (definition once, N data messages follow)
  body.bytes(buildDefinition(2, MSG.WORKOUT_STEP, WORKOUT_STEP_FIELDS));
  spec.steps.forEach((s, i) => body.bytes(stepData(2, s, i)));

  const payload = body.toUint8();
  const crc = fitCrc(payload);

  // Header: 0 (header size) + protocol 2.0 header — 12 bytes with data CRC:
  // [size, "FIT", protocol 2.0, profile minor/major, data size u32, crc u16]
  const header = new ByteWriter();
  header.u8(14);                                    // header size (14 = with CRC)
  header.bytes(new TextEncoder().encode(".FIT"));   // magic
  header.u8(0x20);                                  // protocol version 2.0
  header.u8(0x01);                                  // profile version (minor packed; use 1.0)
  header.u32(payload.length);                       // data size
  const headerCrc = fitCrc(header.toUint8());       // CRC of first 12 header bytes
  header.u16(headerCrc);

  const out = new Uint8Array(14 + payload.length + 2);
  out.set(header.toUint8(), 0);
  out.set(payload, 14);
  out.set([crc & 0xff, (crc >> 8) & 0xff], 14 + payload.length);
  return out;
}

// Convenience: map an app Workout row to a FIT spec (HR/power zones from adaptive.ts).
export function workoutToFitSpec(w: {
  title: string; sport: string; durationMin: number;
  lthr?: number | null; ftp?: number | null;
}, detail?: { zone?: string | null }): FitWorkoutSpec {
  const sport = w.sport === "run" ? WORKOUT_SPORT.running
    : w.sport === "bike" ? WORKOUT_SPORT.cycling
    : w.sport === "swim" ? WORKOUT_SPORT.swimming : WORKOUT_SPORT.generic;
  const zone = (detail?.zone || w.sport || "z2").toLowerCase();
  const hrTarget = w.lthr ? Math.round(w.lthr * (zone.startsWith("z4") ? 0.95 : zone.startsWith("z5") ? 1.02 : 0.88)) : undefined;
  const powerTarget = w.ftp ? Math.round(w.ftp * (zone.startsWith("z4") ? 0.95 : zone.startsWith("z5") ? 1.1 : 0.75)) : undefined;

  const steps: FitStep[] = [
    { name: "Warm up", intensity: STEP_INTENSITY.warmup, durationType: STEP_DURATION.time, durationValue: Math.round(w.durationMin * 60 * 0.15) },
    { name: "Main", intensity: STEP_INTENSITY.active, durationType: STEP_DURATION.time, durationValue: Math.round(w.durationMin * 60 * 0.7), targetType: hrTarget ? STEP_TARGET.hr : powerTarget ? STEP_TARGET.power : STEP_TARGET.open, targetValue: hrTarget ?? powerTarget },
    { name: "Cool down", intensity: STEP_INTENSITY.cooldown, durationType: STEP_DURATION.time, durationValue: Math.round(w.durationMin * 60 * 0.15) },
  ];
  return { name: w.title, sport, steps };
}
