"use client";

import { useEffect, useState } from "react";

interface AuthCardProps {
  /** initial mode */
  initialMode?: "login" | "signup";
  /** show a heading row above the toggle */
  title?: string;
  subtitle?: string;
  /** flow after success — sign-ins go here; signups always enter /onboard */
  redirectTo?: string;
}

export function AuthCard({
  initialMode = "login",
  title = "Sign in to your method",
  subtitle = "Or register — free for athletes.",
  redirectTo = "/today",
}: AuthCardProps) {
  const [mode, setMode] = useState<"login" | "signup">(initialMode);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [birthYear, setBirthYear] = useState("");
  const [error, setError] = useState("");
  const [detail, setDetail] = useState("");
  const [busy, setBusy] = useState(false);
  const [googleNotice, setGoogleNotice] = useState<string | null>(null);

  // Google Sign-In returns here on failure: /login?google=not-configured or
  // /login?google=error&reason=...
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("google") === "not-configured") {
      setGoogleNotice(
        "Google sign-in is not configured on the server yet. Use email & password below, or ask the administrator to add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in Vercel.",
      );
    } else if (params.get("google") === "error") {
      const reason = params.get("reason") || "unknown";
      setGoogleNotice(
        reason === "access_blocked"
          ? "Google sign-in was blocked. If this is a test user, the administrator must add your email as a test user in the Google Cloud OAuth consent screen."
          : `Google sign-in failed (${reason}). Use email & password below.`,
      );
    }
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setDetail("");
    setBusy(true);
    try {
      const res = await fetch(`/api/auth/${mode}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          mode === "signup"
            ? { email, password, name, birthYear }
            : { email, password },
        ),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Something went wrong");
        setDetail(data.detail || "");
        setBusy(false);
        return;
      }
      // First-time signups enter the onboarding wizard; sign-ins go straight
      // to training (the wizard self-skips for onboarded users anyway).
      window.location.href = mode === "signup" ? "/onboard" : redirectTo === "/onboard" ? "/today" : redirectTo;
    } catch {
      setError("Network error — please try again.");
      setDetail("");
      setBusy(false);
    }
  }

  return (
    <div className="rounded-3xl border border-ink-200 bg-white p-6 sm:p-8 shadow-sm">
      <h2 className="font-display text-xl sm:text-2xl font-bold text-ink-900">
        {title}
      </h2>
      <p className="text-sm text-ink-500 mt-1">{subtitle}</p>

      <div className="flex rounded-full border border-ink-200 bg-paper-100 p-1 mt-6 mb-5">
        {(["login", "signup"] as const).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => {
              setMode(m);
              setError("");
            }}
            className={`flex-1 py-2 rounded-full text-sm font-semibold transition-colors ${
              mode === m
                ? "bg-ink-900 text-paper"
                : "text-ink-500 hover:text-ink-900"
            }`}
          >
            {m === "login" ? "Sign in" : "Register"}
          </button>
        ))}
      </div>

      <form onSubmit={submit} className="space-y-4">
        {mode === "signup" && (
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wide text-ink-500 mb-1">
              Full name
            </label>
            <input
              className="field-editorial"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Jasmel Acosta"
              required
            />
          </div>
        )}
        {mode === "signup" && (
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wide text-ink-500 mb-1">
              Birth year (13+ to use the app)
            </label>
            <input
              className="field-editorial"
              type="number"
              min={1930}
              max={2012}
              value={birthYear}
              onChange={(e) => setBirthYear(e.target.value)}
              placeholder="1990"
            />
          </div>
        )}
        <div>
          <label className="block text-xs font-semibold uppercase tracking-wide text-ink-500 mb-1">
            Email
          </label>
          <input
            className="field-editorial"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            required
          />
        </div>
        <div>
          <label className="block text-xs font-semibold uppercase tracking-wide text-ink-500 mb-1">
            Password
          </label>
          <input
            className="field-editorial"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            required
            minLength={8}
          />
        </div>
        {error && (
          <div className="text-sm text-vermillion-600 bg-vermillion-400/10 rounded-lg px-3 py-2">
            {error}
          </div>
        )}
        {detail && (
          <div className="text-[11px] font-mono text-ink-500 mt-1 break-words leading-relaxed">
            {detail}
          </div>
        )}
        <button
          type="submit"
          disabled={busy}
          className="btn-editorial-accent w-full justify-center py-2.5"
        >
          {busy ? "Please wait…" : mode === "login" ? "Sign in" : "Start free"}
        </button>
      </form>

      {/* Google Sign-In — available for all users */}
      <div className="mt-4">
        <div className="flex items-center gap-3 text-[10px] uppercase tracking-wide text-ink-400">
          <span className="h-px flex-1 bg-ink-200" /> or <span className="h-px flex-1 bg-ink-200" />
        </div>
        <a
          href="/api/auth/google"
          className="mt-3 flex w-full items-center justify-center gap-3 rounded-xl border border-ink-200 bg-white px-4 py-2.5 text-sm font-semibold text-ink-800 transition-colors hover:bg-paper-100"
        >
          <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
            <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92a8.78 8.78 0 0 0 2.68-6.62Z" />
            <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.8.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.32A9 9 0 0 0 9 18Z" />
            <path fill="#FBBC05" d="M3.97 10.72a5.41 5.41 0 0 1 0-3.44V4.96H.96a9 9 0 0 0 0 8.08l3.01-2.32Z" />
            <path fill="#EA4335" d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.59A9 9 0 0 0 .96 4.96l3.01 2.32C4.68 5.16 6.66 3.58 9 3.58Z" />
          </svg>
          Continue with Google
        </a>
        {googleNotice && (
          <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mt-3">
            {googleNotice}
          </div>
        )}
      </div>

      <p className="micro mt-5 text-center !normal-case !tracking-normal !text-[11px] !text-ink-400">
        Free for athletes. Your blood, DNA and training data stay private.
      </p>
      <p className="text-[10px] text-ink-400 text-center mt-3 leading-snug">
        {mode === "signup" ? (
          <>
            By creating an account you agree to our{" "}
            <a href="/terms" className="underline" target="_blank">Terms of Service</a>{" "}
            and acknowledge JasMiamiMethod is a coaching tool, not medical advice.
          </>
        ) : (
          <a href="/help" className="underline">Need help? Visit Help &amp; Support</a>
        )}
      </p>
    </div>
  );
}
