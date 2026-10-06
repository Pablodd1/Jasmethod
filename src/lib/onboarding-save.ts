import { onboardingProfileFields } from "./profile-client";

export type OnboardingSection = "profile" | "zones" | "goals" | "travel";
export interface SavedOnboarding { profile: Record<string, unknown>; setup: Record<string, unknown> | null }

/** Section saves never persist drafts from a skipped or unrelated section. */
export function onboardingSectionPayload(section: OnboardingSection, profile: Record<string, unknown>, setup: Record<string, unknown>, saved: SavedOnboarding, setupRevision: string | null) {
  const pick = (keys: string[]) => Object.fromEntries(keys.filter(key => Object.hasOwn(profile, key)).map(key => [key, profile[key]]));
  if (section === "profile") return onboardingProfileFields(pick(["birthYear", "sex", "heightCm", "weightKg"]));
  if (section === "zones") return pick(["lthr", "maxHr", "ftp", "runPaceBase", "swimPaceBase"]);
  if (section === "goals") return {
    ...onboardingProfileFields(pick(["experience", "goal", "weeklyHours"])),
    setup: { ...setup, travel: saved.setup?.travel ?? null }, expectedSetupRevision: setupRevision,
  };
  return {
    setupSection: "travel",
    setup: { travel: setup.travel ?? null }, expectedSetupRevision: setupRevision,
  };
}
