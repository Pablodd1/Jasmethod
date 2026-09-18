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
      window.location.href = redirectTo;
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

      <p className="micro mt-5 text-center !normal-case !tracking-normal !text-[11px] !text-ink-400">
        Free for athletes. Your blood, DNA and training data stay private.
      </p>

      {mode === "login" && (
        <div className="mt-4 border-t border-ink-200 pt-4">
          <div className="micro mb-2 text-[10px] text-ink-400">
            Free athlete access — one tap to sign in:
          </div>
          <div className="grid grid-cols-2 gap-2">
            {[
              { icon: "🏃‍♂️", label: "Jeand", sport: "Run", email: "jeand.duno@gmail.com" },
              { icon: "🏃‍♀️", label: "Kathy", sport: "Run", email: "kathy@jasmiamimethod.com" },
              { icon: "🥉", label: "Jas", sport: "Triathlon", email: "jas@jasmiamimethod.com" },
              { icon: "🏋️", label: "Andres", sport: "Hyrox", email: "andres@jasmiamimethod.com" },
              { icon: "🎽", label: "Julia", sport: "Run", email: "juliaburtseva@gmail.com" },
              { icon: "🦩", label: "Fedra", sport: "Run", email: "fedra@jasmiamimethod.com" },
              { icon: "⚡", label: "John", sport: "400m", email: "john@jasmiamimethod.com" },
              { icon: "⚡", label: "John", sport: "400m", email: "john@jasmiamimethod.com" },
              { icon: "👟", label: "Arl", sport: "Run", email: "arlenramirez0425@gmail.com" },
              { icon: "⚡", label: "M", sport: "Run", email: "m@jasmiamimethod.com" },
            ].map((acct) => (
              <button
                key={acct.email}
                type="button"
                disabled={busy}
                onClick={async () => {
                  setError("");
                  setDetail("");
                  setBusy(true);
                  try {
                    const res = await fetch("/api/auth/demo", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ email: acct.email }),
                    });
                    if (!res.ok) {
                      const data = await res.json().catch(() => ({}));
                      setError(data.error || "Free access login failed");
                      setBusy(false);
                      return;
                    }
                    window.location.href = redirectTo;
                  } catch {
                    setError("Network error — please try again.");
                    setBusy(false);
                  }
                }}
                className="flex w-full items-center gap-2 rounded-xl border border-ink-200 bg-paper-100 px-3 py-2.5 text-sm font-semibold text-ink-800 transition-colors hover:bg-paper-200"
              >
                <span className="text-lg leading-none">{acct.icon}</span>
                <span className="flex-1 truncate text-left">{acct.label}</span>
                <span className="text-[10px] font-medium uppercase tracking-wide text-ink-400">
                  {acct.sport}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
