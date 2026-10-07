"use client";

import { Suspense, useEffect, useId, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { SocialSignIn } from "./social-sign-in";
import { useAuth } from "./auth";
import { accountLanding } from "@/lib/account-landing";

interface AuthCardProps {
  /** initial mode */
  initialMode?: "login" | "signup";
  /** show a heading row above the toggle */
  title?: string;
  subtitle?: string;
  /** flow after success — sign-ins go here; signups always enter /onboard */
  redirectTo?: string;
}

export function AuthCard(props: AuthCardProps) {
  return <Suspense fallback={<p role="status">Loading sign-in…</p>}><AuthCardContent {...props} /></Suspense>;
}

function AuthCardContent({
  initialMode = "login",
  title,
  subtitle = "Athlete registration is free. Use your own account to keep your training together.",
  redirectTo = "/today",
}: AuthCardProps) {
  const { user, loading: sessionLoading, error: sessionError, refresh, logout } = useAuth();
  const params = useSearchParams();
  const [selectedMode, setMode] = useState<"login" | "signup">(() => params.get("mode") === "signup" ? "signup" : initialMode);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [birthYear, setBirthYear] = useState("");
  const [error, setError] = useState("");
  const [detail, setDetail] = useState("");
  const [busy, setBusy] = useState(false);
  const fieldId = useId();
  const linkMode = params.get("link") === "1";
  const linkAfterLogin = params.get("error") === "account_link_required";
  const mode = linkMode || linkAfterLogin ? "login" : selectedMode;
  useEffect(() => {
    if (params.get("link") === "1" || params.get("error") === "account_link_required") setMode("login");
    else if (params.get("mode") === "signup") setMode("signup");
    else setMode(initialMode);
  }, [params, initialMode]);

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
      window.location.href = mode === "signup" ? "/onboard" : linkMode || linkAfterLogin ? "/login?link=1" : accountLanding(data.user?.onboarded);
    } catch {
      setError("Network error — please try again.");
      setDetail("");
      setBusy(false);
    }
  }

  const linking = linkMode || linkAfterLogin;
  if (linking && (sessionLoading || sessionError)) return (
    <div className="rounded-3xl border border-ink-200 bg-white p-6 sm:p-8 shadow-sm">
      <h2 className="font-display text-xl font-bold">Link Google to your existing account</h2>
      <p className="mt-3 text-sm" role={sessionError ? "alert" : "status"}>{sessionError ? "We could not verify your session. Try again before linking a sign-in option." : "Checking which account is signed in…"}</p>
      {sessionError && <button className="btn-editorial mt-4" onClick={() => void refresh()}>Check session again</button>}
      <Link href="/login" className="mt-4 block text-sm underline">Back to sign-in</Link>
    </div>
  );

  if (user) return (
    <div className="rounded-3xl border border-ink-200 bg-white p-6 sm:p-8 shadow-sm">
      <h2 className="font-display text-xl font-bold text-ink-900">{linking ? "Link a sign-in option" : "You are signed in"}</h2>
      <p className="mt-3 text-sm text-ink-700 break-words"><strong>{user.name}</strong><br />{user.email}<br />Account role: {user.role}</p>
      {linking ? <>
        <p className="mt-3 text-sm text-ink-600">Confirm this is the account whose training you want to keep. Linking adds Google as another way to sign in to this account; it does not combine separate athlete and coach accounts.</p>
        <SocialSignIn intent="link" />
      </> : <Link href="/login?link=1" className="mt-5 block text-sm font-semibold underline">Link Google to this account</Link>}
      <div className="mt-5 flex flex-wrap gap-4 items-center">
        <Link href={accountLanding(user.onboarded)} className="btn-editorial">{user.onboarded ? "Continue to Today" : "Continue athlete setup"}</Link>
        <button type="button" onClick={() => void logout()} className="text-sm underline">Sign out to use another account</button>
      </div>
    </div>
  );

  return (
    <div className="rounded-3xl border border-ink-200 bg-white p-6 sm:p-8 shadow-sm">
      <h2 className="font-display text-xl sm:text-2xl font-bold text-ink-900">
        {linking ? "First, sign in to your existing account" : title || (mode === "signup" ? "Create your free athlete account" : "Welcome back")}
      </h2>
      <p className="text-sm text-ink-600 mt-1">{linking ? "Use your existing JMM email and password. After sign-in, you can link Google without losing this account's training data." : subtitle}</p>
      {linking && <ol className="mt-4 list-decimal pl-5 space-y-1 text-sm text-ink-700"><li>Sign in below, or recover your password.</li><li>Check the account name and email on the next screen.</li><li>Choose Link Google and finish Google&apos;s authorization.</li></ol>}

      {!linking && <div className="flex rounded-full border border-ink-200 bg-paper-100 p-1 mt-6 mb-5">
        {(["login", "signup"] as const).map((m) => (
          <button
            key={m}
            type="button"
            aria-pressed={mode === m}
            onClick={() => {
              setMode(m);
              setError("");
              setDetail("");
            }}
            className={`flex-1 py-2 rounded-full text-sm font-semibold transition-colors ${
              mode === m
                ? "bg-ink-900 text-paper"
                : "text-ink-500 hover:text-ink-900"
            }`}
          >
            {m === "login" ? "Sign in" : "Create free account"}
          </button>
        ))}
      </div>}

      <form onSubmit={submit} className="space-y-4 mt-5">
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
              placeholder="Your full name"
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
          {busy ? "Please wait…" : mode === "login" ? linking ? "Sign in, then link Google" : "Sign in" : "Create free athlete account"}
        </button>
      </form>

      <Link href="/forgot-password" className="mt-4 inline-block text-sm underline">Forgot password or cannot access your account?</Link>
      {linking ? <p className="text-sm text-ink-600 mt-3">After resetting your password, return to <Link className="underline" href="/login?link=1">this linking page</Link>. Do not create another account to recover existing data.</p> : <>
        <SocialSignIn intent={mode} />
        <details className="mt-4 rounded-xl border border-ink-200 p-3 text-sm text-ink-700">
          <summary className="cursor-pointer font-semibold">Already have an account but Google does not open it?</summary>
          <p className="mt-2">An existing email does not automatically link accounts. Use your JMM password first; then choose Link Google. If you cannot sign in, recover the password for your existing email.</p>
          <Link className="inline-block mt-3 underline font-semibold" href="/login?link=1">Start guided Google linking</Link>
        </details>
      </>}

      <p className="micro mt-5 text-center !normal-case !tracking-normal !text-[11px] !text-ink-400">
        Free pilot: 50 total accounts. No payment or wearable required. See our <Link className="underline" href="/privacy">privacy policy</Link> for how your data is used.
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
