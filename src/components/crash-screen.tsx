"use client";

import { useEffect, useRef, useState } from "react";
import { buildClientDiagnostics, crashScreenCopy, formatDiagnostics, type ClientDiagnostics } from "@/lib/client-error-diagnostics";

/**
 * What an athlete sees when a page crashes, instead of the generic "Application error" screen.
 *
 * It does not fix the crash that caused it. It makes the crash diagnosable:
 *  - on screen, a collapsed block of sanitized details the athlete can copy and send;
 *  - once, a sanitized report to the existing owner-side intake (/api/telemetry/error), the same
 *    destination ErrorTelemetry already uses. Without this the boundary would swallow errors that
 *    previously reached that ledger.
 * Only sanitized fields are shown or sent: never error.message or error.stack as received.
 * Inline styles only: this also renders from global-error.tsx, where the site stylesheet is not loaded.
 */

type CrashError = Error & { digest?: string };
interface Collected { diagnostics: ClientDiagnostics; es: boolean }

function collect(error: unknown): Collected {
  const nav = navigator as Navigator & { standalone?: boolean };
  let standalone: boolean | undefined;
  try { standalone = nav.standalone === true || window.matchMedia("(display-mode: standalone)").matches; } catch { standalone = undefined; }
  let documentLoadType: string | undefined;
  try { documentLoadType = (performance.getEntriesByType("navigation")[0] as { type?: string } | undefined)?.type; } catch { documentLoadType = undefined; }
  return {
    diagnostics: buildClientDiagnostics({
      error,
      pathname: window.location.pathname,
      userAgent: nav.userAgent,
      buildId: process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA,
      documentLoadType,
      referrer: document.referrer,
      origin: window.location.origin,
      online: nav.onLine,
      standalone,
    }),
    es: (nav.language || "").toLowerCase().startsWith("es"),
  };
}

/** Best-effort, fire-and-forget; the intake is rate limited server-side. */
function reportCrash(d: ClientDiagnostics) {
  try {
    void fetch("/api/telemetry/error", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      keepalive: true,
      body: JSON.stringify({
        message: `Render crash (${d.kind}): ${d.errorName}${d.message ? `: ${d.message}` : ""}`,
        stack: d.stack.join("\n"),
        route: d.route,
      }),
    }).catch(() => {});
  } catch { /* reporting must never break the crash screen */ }
}

const button = { padding: "10px 16px", borderRadius: 8, border: "1px solid #94a3b8", background: "#fff", color: "#0f172a", font: "inherit", fontSize: 14, cursor: "pointer", textDecoration: "none", display: "inline-block" } as const;
const primary = { ...button, background: "#0369a1", borderColor: "#0369a1", color: "#fff" } as const;

export function CrashScreen({ error, reset, bare = false }: { error: CrashError; reset: () => void; bare?: boolean }) {
  const [info, setInfo] = useState<Collected | null>(null);
  const [copied, setCopied] = useState<"idle" | "done" | "failed">("idle");
  const heading = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    heading.current?.focus();
    try {
      const next = collect(error);
      setInfo(next);
      reportCrash(next.diagnostics);
    } catch { /* The screen works without diagnostics. */ }
  }, [error]);

  const t = crashScreenCopy(info?.es ?? false, info?.diagnostics.kind ?? "other");
  const text = info ? formatDiagnostics(info.diagnostics) : "";
  const copyDetails = async () => {
    try { await navigator.clipboard.writeText(text); setCopied("done"); } catch { setCopied("failed"); }
  };

  return (
    <main style={{ maxWidth: 560, margin: "0 auto", padding: "48px 16px" }}>
      <div className={bare ? undefined : "card"}>
        <h1 ref={heading} tabIndex={-1} style={{ fontSize: 22, fontWeight: 700, margin: "0 0 8px", outline: "none" }}>{t.heading}</h1>
        <p style={{ margin: "0 0 16px", fontSize: 15, lineHeight: 1.5 }}>{t.body}</p>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 16 }}>
          <button type="button" style={primary} onClick={() => reset()}>{t.retry}</button>
          <button type="button" style={button} onClick={() => window.location.reload()}>{t.reload}</button>
          {/* A plain link: a full page load works even if client-side routing is what broke. */}
          <a href="/today" style={button}>{t.home}</a>
        </div>
        {info && (
          <details>
            <summary style={{ cursor: "pointer", fontSize: 14 }}>{t.details}</summary>
            <p style={{ fontSize: 12, color: "#475569", margin: "8px 0" }}>{t.detailsHint}</p>
            <pre style={{ whiteSpace: "pre-wrap", wordBreak: "break-word", fontSize: 12, background: "#f1f5f9", padding: 12, borderRadius: 8, userSelect: "text", margin: "0 0 8px" }}>{text}</pre>
            <button type="button" style={button} onClick={copyDetails}>{t.copy}</button>
            <span role="status" style={{ marginLeft: 8, fontSize: 12 }}>{copied === "done" ? t.copied : copied === "failed" ? t.copyFailed : ""}</span>
          </details>
        )}
      </div>
    </main>
  );
}
