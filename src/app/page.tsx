import { AuthProvider } from "@/components/auth";
import LandingPage from "@/components/landing";

export default function Home() {
  return (
    <AuthProvider>
      <LandingPage />
    </AuthProvider>
  );
}
