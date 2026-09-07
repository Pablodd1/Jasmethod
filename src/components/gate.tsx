"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "./auth";
import { AppShell, MobileNav } from "./app-shell";

export function AuthGate({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !user) router.replace("/");
  }, [loading, user, router]);

  if (loading || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-sand-100">
        <div className="text-center">
          <div className="w-10 h-10 border-4 border-ocean-600 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-slate-500 text-sm">Loading JasMiamiMethod…</p>
        </div>
      </div>
    );
  }

  return (
    <>
      <AppShell>{children}</AppShell>
      <MobileNav />
    </>
  );
}

export function ProtectedPage({ children }: { children: React.ReactNode }) {
  return <AuthGate>{children}</AuthGate>;
}
