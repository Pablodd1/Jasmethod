import type { Prisma } from "@prisma/client";

export class RaceUpdateError extends Error {}

/** Manual fields only. Ownership, relations, provider provenance and GPX measurements are immutable here. */
export function parseRaceUpdate(value: unknown): { id: string; data: Prisma.RaceUpdateInput } {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new RaceUpdateError("Invalid race update");
  const body = value as Record<string, unknown>;
  if (typeof body.id !== "string" || !body.id.trim() || body.id.length > 200) throw new RaceUpdateError("Valid race id required");
  const strings: Record<string, number> = { name: 300, distance: 100, location: 1000, bikeTerrain: 100, runTerrain: 100, swimVenue: 100, swimCurrent: 100, federation: 100, category: 100, notes: 10000 };
  const numbers: Record<string, [number, number]> = { targetTempC: [-100, 100], humidity: [0, 100], baseElevM: [-500, 10000], goalTimeMin: [0, 100000], resultMin: [0, 100000], bikeElevM: [0, 100000], runElevM: [0, 100000], waterTempC: [-10, 60] };
  const data: Record<string, unknown> = {};
  for (const [key, raw] of Object.entries(body)) {
    if (key === "id") continue;
    if (!Object.hasOwn(strings, key) && !Object.hasOwn(numbers, key) && !["date", "startTime", "priority"].includes(key)) throw new RaceUpdateError(`Race field cannot be edited: ${key}`);
    if (Object.hasOwn(strings, key)) {
      if ((raw === null || raw === "") && !["name", "distance"].includes(key)) { data[key] = null; continue; }
      if (typeof raw !== "string" || !raw.trim() || raw.length > strings[key]) throw new RaceUpdateError(`Invalid race ${key}`);
      data[key] = raw.trim();
    } else if (Object.hasOwn(numbers, key) || key === "priority") {
      if ((raw === null || raw === "") && key !== "priority") { data[key] = null; continue; }
      if ((typeof raw !== "number" && typeof raw !== "string") || (typeof raw === "string" && !/^-?(?:\d+\.?\d*|\.\d+)$/.test(raw))) throw new RaceUpdateError(`Invalid race ${key}`);
      const numeric = Number(raw), [min, max] = key === "priority" ? [1, 3] : numbers[key];
      if (!Number.isFinite(numeric) || numeric < min || numeric > max || (key === "priority" && !Number.isInteger(numeric))) throw new RaceUpdateError(`Invalid race ${key}`);
      data[key] = numeric;
    } else if (key === "startTime") {
      if (raw === null || raw === "") data[key] = null;
      else if (typeof raw === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(raw)) data[key] = raw;
      else throw new RaceUpdateError("Invalid race start time");
    } else {
      if (typeof raw !== "string" || !/^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z)?$/.test(raw) || !Number.isFinite(Date.parse(raw)) || new Date(raw).toISOString().slice(0, 10) !== raw.slice(0, 10)) throw new RaceUpdateError("Invalid race date");
      data[key] = new Date(raw);
    }
  }
  if (!Object.keys(data).length) throw new RaceUpdateError("No editable race fields supplied");
  return { id: body.id, data: data as Prisma.RaceUpdateInput };
}
