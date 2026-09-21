// JasMiamiMethod — Workout shape graphic ("the red trail")
//
// A small graphic that renders the REAL workout structure: one bar per step,
// x = session time, red intensity by zone (harder = deeper red), grey for
// warm-up/cool-down, pink for recoveries. One source of truth, three skins:
//   - SVG string  → app (Today cards), email-independent surfaces
//   - PNG buffer  → Telegram photo + Gmail inline image (pure-Node encoder,
//                   no canvas/sharp dependency — serverless-safe)
//   - public URL  → calendar descriptions (signed, expiring token)

import { createHmac, timingSafeEqual } from "crypto";
import { deflateSync } from "zlib";
import { structuredSteps } from "./prescription";

export interface GraphicStep {
  name: string;
  seconds: number;
  zone: string;
  phase?: "warmup" | "active" | "recovery" | "cooldown";
}

const RED_BY_ZONE: Record<string, string> = {
  z1: "#f87171", z2: "#f87171", z3: "#ef4444", z4: "#dc2626",
  z5: "#b91c1c", z6: "#991b1b", z7: "#7f1d1d",
};
const WARM_COOL = "#cbd5e1";
const RECOVERY = "#fca5a5";

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function stepColor(s: GraphicStep): string {
  if (s.phase === "warmup" || s.phase === "cooldown") return WARM_COOL;
  if (s.phase === "recovery") return RECOVERY;
  return RED_BY_ZONE[s.zone] || "#dc2626";
}

/** SVG skin — inline in the app and anywhere HTML renders. */
export function renderWorkoutSvg(
  steps: GraphicStep[],
  opts: { width?: number; height?: number } = {},
): string {
  const width = opts.width ?? 640;
  const height = opts.height ?? 72;
  const total = steps.reduce((a, s) => a + s.seconds, 0);
  if (!total) return "";
  const gap = 1.5;
  const bars = steps
    .filter((s) => s.seconds > 0)
    .map((s) => {
      const w = Math.max(1.5, (s.seconds / total) * width - gap);
      const x = steps.slice(0, steps.indexOf(s)).reduce((a, x2) => a + x2.seconds, 0) / total * width;
      return `<rect x="${x.toFixed(1)}" y="0" width="${w.toFixed(1)}" height="${height}" rx="2" fill="${stepColor(s)}"/>`;
    })
    .join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="Workout effort profile — red bars scale with intensity">${bars}</svg>`;
}

// ---- Pure-Node PNG encoder (RGBA, no dependencies) ----

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function pngChunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

/** RGBA pixels (width*height*4) → PNG buffer. */
export function encodePng(width: number, height: number, rgba: Uint8Array): Buffer {
  // Per-scanline filter byte 0 (None) — simple and valid.
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (width * 4 + 1)] = 0;
    rgba.subarray(y * width * 4, (y + 1) * width * 4).forEach((v, i) => {
      raw[y * (width * 4 + 1) + 1 + i] = v;
    });
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", deflateSync(raw)),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

/**
 * Day skin — one row per session, PNG for Telegram/Gmail.
 * White background, red bars per step scaled by zone.
 */
export function renderDayPng(sessions: GraphicStep[][]): Buffer {
  const width = 640;
  const rowH = 22;
  const pad = 6;
  const rows = sessions.filter((s) => s.length);
  const height = Math.max(34, rows.length * (rowH + 6) + pad * 2);
  const px = new Uint8Array(width * height * 4).fill(255); // white bg
  const put = (x: number, y: number, rgb: [number, number, number]) => {
    if (x < 0 || x >= width || y < 0 || y >= height) return;
    const i = (y * width + x) * 4;
    px[i] = rgb[0]; px[i + 1] = rgb[1]; px[i + 2] = rgb[2]; px[i + 3] = 255;
  };
  rows.forEach((steps, r) => {
    const total = steps.reduce((a, s) => a + s.seconds, 0) || 1;
    const y0 = pad + r * (rowH + 6);
    const y1 = y0 + rowH;
    let cursor = 0;
    for (const s of steps) {
      if (s.seconds <= 0) continue;
      const x0 = Math.round((cursor / total) * (width - pad * 2)) + pad;
      cursor += s.seconds;
      const x1 = Math.round((cursor / total) * (width - pad * 2)) + pad;
      const [cr, cg, cb] = hexToRgb(stepColor(s));
      for (let x = x0; x < Math.max(x0 + 2, x1); x++)
        for (let y = y0; y < y1; y++) put(x, y, [cr, cg, cb]);
    }
  });
  return encodePng(width, height, px);
}

// ---- Signed public URL token (for calendar/Telegram fetching) ----

const secret = () => process.env.CRON_SECRET || "jmm-graphic-dev-secret";

export function signGraphicToken(workoutId: string, ttlDays = 30): string {
  const exp = Date.now() + ttlDays * 86400000;
  const sig = createHmac("sha256", secret()).update(`${workoutId}.${exp}`).digest("hex").slice(0, 32);
  return `${exp}.${sig}`;
}

export function verifyGraphicToken(workoutId: string, token: string): boolean {
  const dot = token.indexOf(".");
  if (dot <= 0) return false;
  const exp = Number(token.slice(0, dot));
  const sig = token.slice(dot + 1);
  if (!Number.isFinite(exp) || exp < Date.now()) return false;
  const expected = createHmac("sha256", secret()).update(`${workoutId}.${exp}`).digest("hex").slice(0, 32);
  return sig.length === expected.length && timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
}

/** Resolve steps for a workout without duplicating fit-export logic. */
export function stepsForGraphic(w: {
  durationMin: number;
  intensity?: string | null;
  type?: string | null;
  sport: string;
  prescription?: string | null;
}): GraphicStep[] {
  if (w.prescription) {
    try {
      const p = JSON.parse(w.prescription);
      if (Array.isArray(p.steps) && p.steps.length)
        return p.steps.map((s: any) => ({
          name: String(s.name || "Step"),
          seconds: Number(s.seconds) || 0,
          zone: String(s.zone || "z2"),
          phase: s.phase,
        }));
    } catch {}
  }
  // Same fallback the FIT export uses: regenerate from the session shape.
  return structuredSteps(w.durationMin, w.intensity || "z2", w.type || "endurance", 0, w.sport);
}
