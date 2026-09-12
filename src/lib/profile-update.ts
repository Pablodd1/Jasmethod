import { ApiError } from "./access";
import { parseDate } from "./dates";

const numeric: Record<string, [number, number]> = {
  birthYear: [1900, new Date().getFullYear() - 13],
  heightCm: [80, 250],
  weightKg: [20, 350],
  weeklyHours: [0.5, 40],
  vo2max: [10, 100],
  lthr: [60, 230],
  restingHr: [25, 150],
  maxHr: [80, 240],
  ftp: [20, 700],
  cp: [20, 700],
  wPrime: [1, 100],
  swimPaceBase: [30, 600],
  runPaceBase: [120, 1200],
  hrvBaseline: [1, 300],
  sweatRateMlH: [100, 3000],
  sodiumMgPerL: [100, 2500],
};
const integers = new Set(["birthYear", "lthr", "restingHr", "maxHr"]);
const options: Record<string, string[]> = {
  sex: ["male", "female"],
  experience: ["beginner", "amateur", "advanced", "pro"],
  goal: [
    "sprint",
    "olympic",
    "half",
    "full",
    "hyrox",
    "boxing",
    "run-only",
    "cycle",
    "swim-only",
    "lifting",
    "5k",
    "10k",
    "half-marathon",
    "marathon",
  ],
  trainingWindow: ["any", "morning", "midday", "evening"],
  bikeType: ["road", "tt", "tri", "gravel", "mountain"],
  draftSkill: ["none", "mixed", "good"],
  federation: ["USAT", "WORLD_TRIATHLON", "BRITISH_TRIATHLON", "IRONMAN"],
  category: ["age_group", "elite"],
};
const flags = [
  "gutTrained",
  "injured",
  "hasBikePowerMeter",
  "hasRunPowerMeter",
  "hasBikeComputer",
  "hasAeroBars",
  "hasHrm",
  "hasGpsWatch",
  "hasSwimPaceTool",
  "hasSmartTrainer",
  "hasCadenceSensor",
];
export function profilePatch(body: Record<string, unknown>, timezone: string) {
  const data: Record<string, any> = {};
  for (const [key, value] of Object.entries(body)) {
    if (numeric[key]) {
      if (value === null || value === "") {
        if (key === "weeklyHours")
          throw new ApiError("Weekly hours are required");
        data[key] = null;
        continue;
      }
      const n = Number(value),
        [min, max] = numeric[key];
      if (
        !Number.isFinite(n) ||
        n < min ||
        n > max ||
        (integers.has(key) && !Number.isInteger(n))
      )
        throw new ApiError(`Invalid ${key}: expected ${min}–${max}`);
      data[key] = n;
    } else if (options[key]) {
      if (value === null && !["experience", "trainingWindow"].includes(key))
        data[key] = null;
      else if (options[key].includes(String(value))) data[key] = String(value);
      else throw new ApiError(`Invalid ${key}`);
    } else if (flags.includes(key)) {
      if (typeof value !== "boolean") throw new ApiError(`Invalid ${key}`);
      data[key] = value;
    } else if (key === "notes")
      data.notes = value == null ? null : String(value).slice(0, 4000);
    else if (key === "raceDate")
      data.raceDate = value ? parseDate(String(value), timezone) : null;
    else throw new ApiError(`Field cannot be edited: ${key}`);
  }
  return data;
}
