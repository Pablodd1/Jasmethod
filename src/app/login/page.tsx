import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { SiteHeader, SiteFooter } from "@/components/site-shell";
import { AuthCard } from "@/components/auth-card";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Sign in or create a free athlete account — JasMiamiMethod",
  description: "Create your free JMM athlete account, sign in, recover access, or securely link Google to your existing training history.",
  alternates: { canonical: "/login" },
};

// Dedicated sign-in page. Also the landing spot for Google Sign-In errors:
// /login?google=not-configured (server missing GOOGLE_CLIENT_ID/SECRET) and
// /login?google=error&reason=... (OAuth flow failure).
export default function LoginPage() {
  return (
    <div className="min-h-screen bg-paper">
      <SiteHeader />
      <main className="pub-container py-12 sm:py-16">
        <h1 className="sr-only">Sign in or create a free JMM athlete account</h1>
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-sm text-ink-500 hover:text-ink-900 mb-6"
        >
          <ArrowLeft className="w-4 h-4" /> Back to home
        </Link>
        <div className="max-w-md">
          <AuthCard initialMode="login" redirectTo="/today" />
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
