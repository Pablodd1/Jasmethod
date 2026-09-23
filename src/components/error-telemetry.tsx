"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

// Client error telemetry: window.onerror + unhandledrejection → /api/telemetry/error.
// Throttled and capped — a broken page can never spam the ledger.
export function ErrorTelemetry() {
  const pathname = usePathname();
  useEffect(() => {
    let sent = 0;
    const lastSentAt = { t: 0 };
    const report = (message: string, stack?: string) => {
      const now = Date.now();
      if (sent >= 5 || now - lastSentAt.t < 10000) return; // max 5/10s
      sent++;
      lastSentAt.t = now;
      try {
        fetch("/api/telemetry/error", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            message,
            stack,
            route: pathname,
            appVersion: undefined,
          }),
          keepalive: true,
        }).catch(() => {});
      } catch {}
    };
    const onError = (e: ErrorEvent) =>
      report(e.message || "ErrorEvent", e.error?.stack);
    const onRejection = (e: PromiseRejectionEvent) =>
      report(`Unhandled rejection: ${String(e.reason).slice(0, 300)}`);
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
    };
  }, [pathname]);
  return null;
}
