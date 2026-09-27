export const ONBOARDING_STEP = { welcome:0, profile:1, devices:2, race:3, done:4 } as const;
export type OnboardingStep = typeof ONBOARDING_STEP[keyof typeof ONBOARDING_STEP];
export function onboardingNext(step: OnboardingStep, saved = true): OnboardingStep {
  if (!saved || step === ONBOARDING_STEP.done) return step;
  return (step + 1) as OnboardingStep;
}
