import { PLANNABLE_GOALS, planningGoal } from "./planning-setup";
import { onboardingProfileFields } from "./profile-client";

export type OnboardingSection = "profile" | "zones" | "goals" | "travel";
export interface SavedOnboarding { profile: Record<string, unknown>; setup: Record<string, unknown> | null }

/** Section saves never persist drafts from a skipped or unrelated section. */
export function onboardingSectionPayload(section: OnboardingSection, profile: Record<string, unknown>, setup: Record<string, unknown>, saved: SavedOnboarding, setupRevision: string | null) {
  const pick = (keys: string[]) => Object.fromEntries(keys.filter(key => Object.hasOwn(profile, key)).map(key => [key, profile[key]]));
  if (section === "profile") return onboardingProfileFields(pick(["birthYear", "sex", "heightCm", "weightKg"]));
  if (section === "zones") return pick(["lthr", "maxHr", "ftp", "runPaceBase", "swimPaceBase"]);
  if (section === "goals") {
    const answers = onboardingProfileFields(pick(["experience", "goal", "weeklyHours"]));
    // Preserve historical goals on an unrelated edit, but never offer them as a new planning choice.
    if (typeof answers.goal === "string" && answers.goal === saved.profile.goal && !PLANNABLE_GOALS.includes(planningGoal(answers.goal)!)) delete answers.goal;
    return {
      ...answers,
      setup: { ...setup, profileAnswers: { experience: !!profile.experience, weeklyHours: profile.weeklyHours != null && profile.weeklyHours !== "" }, travel: saved.setup?.travel ?? null }, expectedSetupRevision: setupRevision,
    };
  }
  return {
    setupSection: "travel",
    setup: { travel: setup.travel ?? null }, expectedSetupRevision: setupRevision,
  };
}
