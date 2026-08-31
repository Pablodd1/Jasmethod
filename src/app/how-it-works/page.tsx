import { AuthProvider } from "@/components/auth";
import LandingPage from "@/components/landing";

export default function HowItWorksPage() {
  return (
    <AuthProvider>
      <LandingPage />
    </AuthProvider>
  );
}
