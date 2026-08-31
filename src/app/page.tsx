import { AuthProvider } from "@/components/auth";
import SignInGate from "@/components/sign-in-gate";

export default function Home() {
  return (
    <AuthProvider>
      <SignInGate />
    </AuthProvider>
  );
}
