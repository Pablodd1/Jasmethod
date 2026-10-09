import { dateKey } from "./dates";

const textFields = ["birthYear","sex","heightCm","weightKg","experience","goal","weeklyHours","vo2max","lthr","maxHr","ftp","cp","restingHr","hrvBaseline","sweatRateMlH","sodiumMgPerL","runPaceBase","swimPaceBase","trainingWindow","units","raceDate"] as const;
const numericFields = new Set(["birthYear","heightCm","weightKg","weeklyHours","vo2max","lthr","maxHr","ftp","cp","restingHr","hrvBaseline","sweatRateMlH","sodiumMgPerL","runPaceBase","swimPaceBase"]);
export type SettingsProfileForm = Record<typeof textFields[number], string> & {injured:boolean};

/** Render known values exactly; never manufacture a goal, experience or available time. */
export function settingsProfileForm(profile: Record<string,unknown>|null, timezone?:string): SettingsProfileForm {
  const form = Object.fromEntries(textFields.map(key=>[key,profile?.[key] == null ? "" : String(profile[key])])) as unknown as SettingsProfileForm;
  form.trainingWindow ||= "any";
  form.units ||= "auto";
  form.injured = profile?.injured === true;
  if (profile?.raceDate) form.raceDate = dateKey(new Date(String(profile.raceDate)),timezone);
  return form;
}
function normalizedValue(key:string,value:string|boolean):string|number|boolean|null {
  if (typeof value === "boolean") return value;
  if (value === "") return null;
  // Preserve invalid text for server validation rather than truncate or silently clear it.
  if (numericFields.has(key) && Number.isFinite(Number(value))) return Number(value);
  return value;
}

/** Submit explicit edits only. Unrelated nullable values, provenance and legacy goals remain untouched. */
export function settingsProfilePatch(form:SettingsProfileForm,saved:SettingsProfileForm) {
  const patch:Record<string,unknown> = {};
  for (const key of [...textFields,"injured"] as const) {
    const next=normalizedValue(key,form[key]), before=normalizedValue(key,saved[key]);
    if (Object.is(next,before)) continue;
    if (next === null && ["experience","weeklyHours","trainingWindow"].includes(key)) throw Error(`Choose a valid ${key === "weeklyHours" ? "weekly training time" : key === "trainingWindow" ? "training window" : "experience level"} before saving.`);
    patch[key] = next;
  }
  return patch;
}
