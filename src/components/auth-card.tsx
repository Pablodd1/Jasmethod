"use client";

import { useEffect, useId, useState } from "react";
import { SocialSignIn } from "./social-sign-in";

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
  const fieldId = useId();
  const [linkMode, setLinkMode] = useState(false);
  const [linkAfterLogin, setLinkAfterLogin] = useState(false);
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setLinkMode(params.get("link") === "1");
    setLinkAfterLogin(params.get("error") === "account_link_required");
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
      window.location.href = mode === "signup" ? "/onboard" : linkAfterLogin ? "/login?link=1" : redirectTo === "/onboard" ? "/today" : redirectTo;
    } catch {
      setError("Network error — please try again.");
      setDetail("");
      setBusy(false);
    }
  }

  if (linkMode) return (
    <div className="rounded-3xl border border-ink-200 bg-white p-6 sm:p-8 shadow-sm">
      <h2 className="font-display text-xl font-bold text-ink-900">Link a sign-in option</h2>
      <p className="mt-2 text-sm text-ink-600">After signing in to your existing account, choose the provider you want to link. Your training stays in the same account.</p>
      <SocialSignIn />
      <a href="/login" className="mt-4 inline-block text-sm underline">Sign in with email instead</a>
      <a href="/today" className="mt-4 ml-4 inline-block text-sm underline">Back to training</a>
    </div>
  );

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
            aria-pressed={mode === m}
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
            <label htmlFor={`${fieldId}-name`} className="block text-xs font-semibold uppercase tracking-wide text-ink-500 mb-1">
              Full name
            </label>
            <input
              id={`${fieldId}-name`}
              name="name"
              autoComplete="name"
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
            <label htmlFor={`${fieldId}-birth-year`} className="block text-xs font-semibold uppercase tracking-wide text-ink-500 mb-1">
              Birth year (13+ to use the app)
            </label>
            <input
              id={`${fieldId}-birth-year`}
              name="birth-year"
              autoComplete="bday-year"
              className="field-editorial"
              type="number"
              min={1930}
              max={new Date().getFullYear() - 13}
              value={birthYear}
              onChange={(e) => setBirthYear(e.target.value)}
              placeholder="1990"
            />
          </div>
        )}
        <div>
          <label htmlFor={`${fieldId}-email`} className="block text-xs font-semibold uppercase tracking-wide text-ink-500 mb-1">
            Email
          </label>
          <input
            id={`${fieldId}-email`}
            name="email"
            autoComplete="email"
            className="field-editorial"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            required
          />
        </div>
        <div>
          <label htmlFor={`${fieldId}-password`} className="block text-xs font-semibold uppercase tracking-wide text-ink-500 mb-1">
            Password
          </label>
          <input
            id={`${fieldId}-password`}
            name="password"
            autoComplete={mode === "signup" ? "new-password" : "current-password"}
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
          <div role="alert" className="text-sm text-vermillion-600 bg-vermillion-400/10 rounded-lg px-3 py-2">
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

      <SocialSignIn />

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
