"use client";

import { useState } from "react";

interface AuthCardProps {
  /** initial mode */
  initialMode?: "login" | "signup";
  /** show a heading row above the toggle */
  title?: string;
  subtitle?: string;
  /** flow after success — defaults to /dashboard */
  redirectTo?: string;
}

export function AuthCard({
  initialMode = "login",
  title = "Sign in to your method",
  subtitle = "Or register — free for athletes.",
  redirectTo = "/dashboard",
}: AuthCardProps) {
  const [mode, setMode] = useState<"login" | "signup">(initialMode);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [birthYear, setBirthYear] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      const res = await fetch(`/api/auth/${mode}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          mode === "signup" ? { email, password, name, birthYear } : { email, password }
        ),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Something went wrong");
        setBusy(false);
        return;
      }
      window.location.href = redirectTo;
    } catch {
      setError("Network error — please try again.");
      setBusy(false);
    }
  }

  return (
    <div className="rounded-3xl border border-ink-200 bg-white p-6 sm:p-8 shadow-sm">
      <h2 className="font-display text-xl sm:text-2xl font-bold text-ink-900">{title}</h2>
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
              mode === m ? "bg-ink-900 text-paper" : "text-ink-500 hover:text-ink-900"
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
        <button type="submit" disabled={busy} className="btn-editorial-accent w-full justify-center py-2.5">
          {busy ? "Please wait…" : mode === "login" ? "Sign in" : "Start free"}
        </button>
      </form>

      <p className="micro mt-5 text-center !normal-case !tracking-normal !text-[11px] !text-ink-400">
        Free for athletes. Your blood, DNA and training data stay private.
      </p>
    </div>
  );
}
