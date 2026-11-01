import { PLANNABLE_GOALS, planningGoal } from "./planning-setup";
import { onboardingProfileFields } from "./profile-client";
import { weeklyAvailabilityMinutes } from './planning-availability';

export type OnboardingSection = "profile" | "essentials" | "zones" | "intent" | "goals" | "travel";
export interface SavedOnboarding { profile: Record<string, unknown>; setup: Record<string, unknown> | null }

/** Section saves never persist drafts from a skipped or unrelated section. */
export function onboardingSectionPayload(section: OnboardingSection, profile: Record<string, unknown>, setup: Record<string, unknown>, saved: SavedOnboarding, setupRevision: string | null) {
  const pick = (keys: string[]) => Object.fromEntries(keys.filter(key => Object.hasOwn(profile, key)).map(key => [key, profile[key]]));
  if (section === "essentials") {
    // Omit unchanged values, including manually reviewed references and missing answers.
    return {...onboardingProfileFields(Object.fromEntries(["birthYear","sex","heightCm","weightKg"].filter(key=>Object.hasOwn(profile,key)&&profile[key]!==""&&profile[key]!=null&&String(profile[key])!==String(saved.profile[key]??"")).map(key=>[key,profile[key]]))),...Object.fromEntries(["lthr", "maxHr", "ftp", "runPaceBase", "swimPaceBase", "manualPrs"]
      .filter(key => Object.hasOwn(profile,key) && (key === "manualPrs" || saved.profile[key] == null || saved.profile[key] === "") && String(profile[key] ?? "") !== String(saved.profile[key] ?? ""))
      .map(key => [key,profile[key]]))};
  }
  if (section === "profile") return onboardingProfileFields(pick(["birthYear", "sex", "heightCm", "weightKg"]));
  if (section === "zones") return pick(["lthr", "maxHr", "ftp", "runPaceBase", "swimPaceBase", "manualPrs"]);
  if (section === "intent") {
    const answers = onboardingProfileFields(pick(["goal"]));
    if (typeof answers.goal === "string" && answers.goal === saved.profile.goal && !PLANNABLE_GOALS.includes(planningGoal(answers.goal)!)) delete answers.goal;
    return {...answers,setupSection:"intent",setup:{goalDescription:setup.goalDescription,planWeeks:setup.planWeeks},expectedSetupRevision:setupRevision};
  }
  if (section === "goals") {
    const {availableWeeklyHours,...canonicalSetup}=setup;
    if(Object.hasOwn(setup,'availableWeeklyHours')) canonicalSetup.availableWeeklyMinutes=weeklyAvailabilityMinutes(availableWeeklyHours);
    const answers = onboardingProfileFields(pick(["experience", "goal"]));
    // Preserve historical goals on an unrelated edit, but never offer them as a new planning choice.
    if (typeof answers.goal === "string" && answers.goal === saved.profile.goal && !PLANNABLE_GOALS.includes(planningGoal(answers.goal)!)) delete answers.goal;
    return {
      ...answers,
      setup: { ...canonicalSetup, profileAnswers: { experience: !!profile.experience, weeklyHours: (saved.setup?.profileAnswers as {weeklyHours?:boolean}|undefined)?.weeklyHours === true }, travel: saved.setup?.travel ?? null }, expectedSetupRevision: setupRevision,
    };
  }
  return {
    setupSection: "travel",
    setup: { travel: setup.travel ?? null }, expectedSetupRevision: setupRevision,
  };
}
