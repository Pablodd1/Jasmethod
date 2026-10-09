import type { DoubleDayPreference } from "./double-day";
import type { TravelContext } from "./planning-setup";
import { ONBOARDING_STEP, onboardingResume, type OnboardingStep } from "./onboarding-flow";

export const EMPTY_PROFILE = {
  birthYear: "", sex: "", heightCm: "", weightKg: "", experience: "", goal: "",
  weeklyHours: "", lthr: "", maxHr: "", ftp: "", runPaceBase: "", swimPaceBase: "",
};
export type ProfileForm = typeof EMPTY_PROFILE;
export const EMPTY_SETUP = {
  doubleDay: null as DoubleDayPreference | null, travel: null as TravelContext | null,
  coachPreference: "", adultConfirmed: false, profileConfirmed: false, goalDescription: "",
  baselineWeeklyMinutes: "", baselineObservedAt: "", interruptions: "unknown", restrictions: "unknown",
  qualifiedReview: "unknown", trainingDays: [] as number[], maxSessionMinutes: "", equipmentAccess: "",
  planWeeks: "", trackEvent: "", baselinePlanOptIn: false,
  targetGoal: null as { context?: string; contextDescription?: string; metric: string; sport: string; value?: string | number; unit?: string; targetDate?: string } | null,
};
export type SetupForm = typeof EMPTY_SETUP;
export const EMPTY_RACE = { name: "", distance: "", date: "", location: "" };
export type RaceForm = typeof EMPTY_RACE;
const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);

/** Database defaults are not athlete answers. Saved explicit answers are independent of eligibility confirmation. */
export function hydrateOnboarding(profile: Record<string, unknown> | null, setup: Record<string, unknown> | null) {
  const form = { ...EMPTY_PROFILE };
  for (const key of Object.keys(form) as (keyof ProfileForm)[]) {
    form[key] = typeof profile?.[key] === "string" || typeof profile?.[key] === "number" ? String(profile[key]) : "";
  }
  const answers = record(setup?.profileAnswers) ? setup.profileAnswers : {};
  if (!setup?.profileConfirmed && !answers.experience) form.experience = "";
  if (!setup?.profileConfirmed && !answers.weeklyHours) form.weeklyHours = "";
  const context: SetupForm = { ...EMPTY_SETUP, trainingDays: [] };
  if (setup) {
    for (const key of Object.keys(EMPTY_SETUP) as (keyof SetupForm)[]) {
      const value = setup[key];
      if (typeof EMPTY_SETUP[key] === "string") {
        (context as Record<string, unknown>)[key] = typeof value === "string" || typeof value === "number" ? String(value) : EMPTY_SETUP[key];
      } else if (typeof EMPTY_SETUP[key] === "boolean") {
        (context as Record<string, unknown>)[key] = value === true;
      }
    }
    context.trainingDays = Array.isArray(setup.trainingDays) ? setup.trainingDays.filter((d): d is number => Number.isInteger(d) && Number(d) >= 0 && Number(d) <= 6) : [];
    context.travel = record(setup.travel) ? setup.travel as unknown as TravelContext : null;
    context.doubleDay = record(setup.doubleDay) ? setup.doubleDay as unknown as DoubleDayPreference : null;
    context.targetGoal = record(setup.targetGoal) && typeof setup.targetGoal.metric === "string" && typeof setup.targetGoal.sport === "string" ? setup.targetGoal as SetupForm["targetGoal"] : null;
  }
  return { profile: form, setup: context };
}

export const onboardingDraftKey = (userId: string) => `jmm_setup_draft_v1_${userId}`;
export type OnboardingDraft = {
  version: 1; userId: string; revision: string; setupRevision: string | null;
  profile: ProfileForm; setup: SetupForm; step: OnboardingStep;
  race: RaceForm; raceId: string | null; reviewedWeightId: string | null;
};

/** Tab-scoped drafts never masquerade as server saves or overwrite a newer server revision. */
export function restoreOnboardingDraft(raw: string | null, userId: string, revision: string, setupRevision: string | null): OnboardingDraft | null {
  if (!raw || raw.length > 100_000) return null;
  try {
    const draft: unknown = JSON.parse(raw);
    if (!record(draft) || draft.version !== 1 || draft.userId !== userId || draft.revision !== revision || draft.setupRevision !== setupRevision) return null;
    if (!record(draft.profile) || !record(draft.setup) || !record(draft.race)) return null;
    if (Object.keys(EMPTY_PROFILE).some(key => typeof (draft.profile as Record<string, unknown>)[key] !== "string")) return null;
    if (Object.keys(EMPTY_RACE).some(key => typeof (draft.race as Record<string, unknown>)[key] !== "string")) return null;
    const hydrated = hydrateOnboarding(draft.profile, { ...draft.setup, profileAnswers: { experience: true, weeklyHours: true } });
    return {
      version: 1, userId, revision, setupRevision, ...hydrated,
      step: onboardingResume(String(draft.step ?? ONBOARDING_STEP.devices)),
      race: Object.fromEntries(Object.keys(EMPTY_RACE).map(key => [key, (draft.race as Record<string, unknown>)[key]])) as RaceForm,
      raceId: typeof draft.raceId === "string" ? draft.raceId : null,
      reviewedWeightId: typeof draft.reviewedWeightId === "string" ? draft.reviewedWeightId : null,
    };
  } catch { return null; }
}

/** Clear potentially sensitive drafts on confirmed sign-out, not transient network errors. */
export function clearOnboardingDrafts(storage: Pick<Storage, "length" | "key" | "removeItem">) {
  const keys = Array.from({length:storage.length}, (_,index)=>storage.key(index));
  for (const key of keys) if (key?.startsWith("jmm_setup_draft_v1_")) storage.removeItem(key);
}
