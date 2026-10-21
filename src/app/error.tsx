"use client";

import { CrashScreen } from "@/components/crash-screen";

// Route-level boundary: shown instead of Next.js's generic "Application error" screen when a page crashes.
// It improves diagnostics; it does not fix the crash that triggered it.
export default function RouteError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <CrashScreen error={error} reset={reset} />;
}
