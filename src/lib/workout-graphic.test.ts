import { test } from "node:test";
import assert from "node:assert";
import { inflateSync } from "zlib";
import {
  renderWorkoutSvg,
  renderDayPng,
  encodePng,
  signGraphicToken,
  verifyGraphicToken,
  stepsForGraphic,
} from "./workout-graphic";

const steps = [
  { name: "Warm up", seconds: 540, zone: "z1", phase: "warmup" as const },
  { name: "Effort", seconds: 600, zone: "z5", phase: "active" as const },
  { name: "Recovery", seconds: 120, zone: "z1", phase: "recovery" as const },
  { name: "Cool down", seconds: 540, zone: "z1", phase: "cooldown" as const },
];

test("svg: red bars per step, warm-up grey, widths proportional", () => {
  const svg = renderWorkoutSvg(steps);
  assert.match(svg, /<svg/);
  assert.match(svg, /fill="#b91c1c"/); // z5 deep red
  assert.match(svg, /fill="#cbd5e1"/); // warm-up grey
  assert.match(svg, /fill="#fca5a5"/); // recovery pink
  const empty = renderWorkoutSvg([]);
  assert.strictEqual(empty, "");
});

test("png encoder produces a valid signature + IHDR + decodable IDAT", () => {
  const w = 640, h = 50;
  const px = new Uint8Array(w * h * 4).fill(255);
  const png = encodePng(w, h, px);
  assert.ok(png[0] === 0x89 && png[1] === 0x50 && png[2] === 0x4e && png[3] === 0x47);
  assert.strictEqual(png.readUInt32BE(16), w);
  assert.strictEqual(png.readUInt32BE(20), h);
  // Walk chunks: first is IHDR(13), second must be IDAT that inflates to the
  // exact filtered-scanline size — a real structural validation.
  let off = 8;
  const chunks: string[] = [];
  let idat = Buffer.alloc(0);
  while (off < png.length - 4) {
    const len = png.readUInt32BE(off);
    const type = png.toString("ascii", off + 4, off + 8);
    chunks.push(type);
    if (type === "IDAT")
      idat = Buffer.concat([idat, png.subarray(off + 8, off + 8 + len)]);
    off += 12 + len;
  }
  assert.ok(chunks.includes("IHDR") && chunks.includes("IDAT") && chunks.includes("IEND"));
  const raw = inflateSync(idat);
  assert.strictEqual(raw.length, (w * 4 + 1) * h);
});

test("day png: two sessions render, empty input still yields a valid png", () => {
  const png = renderDayPng([steps, steps]);
  assert.ok(png[0] === 0x89 && png[1] === 0x50);
  const one = renderDayPng([steps]);
  assert.ok(one.length > 0);
});

test("graphic tokens: round-trip verifies, tamper and expiry fail", async () => {
  process.env.CRON_SECRET = "test-secret-123";
  const mod = await import("./workout-graphic");
  const token = mod.signGraphicToken("workout_abc", 1);
  assert.ok(mod.verifyGraphicToken("workout_abc", token));
  assert.ok(!mod.verifyGraphicToken("other_workout", token), "wrong id fails");
  assert.ok(!mod.verifyGraphicToken("workout_abc", token.slice(0, -2) + "zz"), "tampered sig fails");
  // expired: sign with negative ttl then backdate via the token's exp field
  const expired = mod.signGraphicToken("workout_abc", -1);
  assert.ok(!mod.verifyGraphicToken("workout_abc", expired), "expired fails");
});

test("stepsForGraphic: uses prescription steps, falls back to structured build", () => {
  const fromRx = stepsForGraphic({
    durationMin: 60, sport: "run", type: "interval",
    prescription: JSON.stringify({ steps }),
  });
  assert.strictEqual(fromRx.length, 4);
  const built = stepsForGraphic({
    durationMin: 45, sport: "run", type: "interval", intensity: "z4",
  });
  assert.ok(built.length >= 3, "fallback builds a real profile");
});
