export const ONBOARDING_STEP = { welcome:0, devices:1, profile:2, zones:3, race:4, travel:5, done:6 } as const;
export type OnboardingStep = typeof ONBOARDING_STEP[keyof typeof ONBOARDING_STEP];
export function onboardingNext(step: OnboardingStep, saved = true): OnboardingStep {
  if (!saved || step === ONBOARDING_STEP.done) return step;
  // Keep the main journey short. Optional zones/travel remain directly reachable.
  if (step === ONBOARDING_STEP.profile) return ONBOARDING_STEP.race;
  if (step === ONBOARDING_STEP.race) return ONBOARDING_STEP.done;
  return (step + 1) as OnboardingStep;
}
export function onboardingResume(value: string | null): OnboardingStep {
  if (value && Object.prototype.hasOwnProperty.call(ONBOARDING_STEP, value)) return ONBOARDING_STEP[value as keyof typeof ONBOARDING_STEP];
  const n = value === null ? 0 : Number(value);
  return Number.isInteger(n) && n >= 0 && n <= ONBOARDING_STEP.done ? n as OnboardingStep : ONBOARDING_STEP.welcome;
}
