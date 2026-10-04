import { PasswordRecovery } from "@/components/password-recovery";
export const metadata = { title: "Recover account — JasMiamiMethod", robots: { index: false, follow: false }, referrer: "no-referrer" as const };
export default function ForgotPasswordPage() { return <main className="min-h-screen bg-paper p-6 sm:py-16"><div className="mx-auto max-w-md"><PasswordRecovery /></div></main>; }
