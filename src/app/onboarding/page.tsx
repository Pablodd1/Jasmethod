import { redirect } from "next/navigation";

// Legacy entry — onboarding lives at /onboard (the wizard). The old public
// explainer had no inbound links; park it as a redirect to the wizard.
export default function LegacyOnboardingPage() {
  redirect("/onboard");
}
