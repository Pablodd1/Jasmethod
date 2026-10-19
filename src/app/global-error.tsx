"use client";

import { CrashScreen } from "@/components/crash-screen";

// Last-resort boundary for a crash in the root layout itself. It replaces the layout, so it renders its own
// <html> and <body> and cannot rely on the site stylesheet (CrashScreen uses inline styles for this reason).
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, fontFamily: "system-ui, -apple-system, sans-serif", background: "#f8fafc", color: "#0f172a" }}>
        <CrashScreen error={error} reset={reset} bare />
      </body>
    </html>
  );
}
