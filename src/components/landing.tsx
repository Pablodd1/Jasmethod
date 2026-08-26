"use client";

import { useState } from "react";
import Link from "next/link";
import { Waves, Activity, HeartPulse, Dna, FlaskConical, Moon, Apple, Dumbbell, ArrowRight, Bike, Zap, CalendarDays } from "lucide-react";

export default function LandingPage() {
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
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
        body: JSON.stringify(mode === "signup" ? { email, password, name } : { email, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Something went wrong");
        setBusy(false);
        return;
      }
      window.location.href = "/dashboard";
    } catch {
      setError("Network error — please try again.");
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-ocean-950 via-ocean-900 to-ocean-800 text-white">
      <div className="max-w-6xl mx-auto px-6 py-10">
        {/* Hero */}
        <div className="text-center py-10 md:py-16">
          <div className="inline-flex items-center gap-2 bg-ocean-800/60 rounded-full px-4 py-1.5 text-xs font-semibold text-ocean-200 mb-6">
            <Activity className="w-3.5 h-3.5" /> Post-2000 sports medicine · HRV-driven · Periodized
          </div>
          <h1 className="font-display text-4xl md:text-6xl font-extrabold tracking-tight mb-4">
            JasMiamiMethod
          </h1>
          <p className="text-ocean-200 text-lg md:text-xl max-w-2xl mx-auto">
            The science-backed triathlon method. Daily training, sleep, recovery, HRV, blood panels,
            DNA, nutrition & hydration — one coach, every ingredient.
          </p>
          <div className="flex flex-wrap justify-center gap-3 mt-8 text-sm">
            {[
              { icon: Dumbbell, label: "Periodized Plans" },
              { icon: HeartPulse, label: "HRV Readiness" },
              { icon: Moon, label: "Sleep Science" },
              { icon: Apple, label: "Nutrition" },
              { icon: FlaskConical, label: "Blood Panels" },
              { icon: Dna, label: "DNA Analysis" },
            ].map((f) => (
              <span key={f.label} className="flex items-center gap-1.5 bg-ocean-800/50 rounded-full px-3.5 py-1.5 text-ocean-100">
                <f.icon className="w-4 h-4 text-ocean-300" /> {f.label}
              </span>
            ))}
          </div>
        </div>

        {/* Free training banner */}
        <div className="max-w-3xl mx-auto mt-4 mb-10">
          <div className="bg-ocean-800/40 border border-ocean-700/60 rounded-3xl p-6 md:p-8">
            <div className="text-center mb-6">
              <div className="inline-flex items-center gap-1.5 bg-emerald-500/20 text-emerald-300 rounded-full px-3 py-1 text-[11px] font-bold uppercase tracking-wider mb-3">
                <CalendarDays className="w-3.5 h-3.5" /> Free with the app
              </div>
              <h2 className="font-display text-2xl md:text-3xl font-bold">Free group training, every week</h2>
              <p className="text-ocean-200 text-sm mt-1">Two coached sessions open to everyone. No catch — just show up and go.</p>
            </div>

            <div className="grid md:grid-cols-2 gap-4">
              <div className="bg-white/5 border border-ocean-600/40 rounded-2xl p-5">
                <div className="flex items-center gap-2 text-coral-300 text-xs font-bold uppercase tracking-wide mb-2">
                  <Zap className="w-4 h-4" /> Wednesday
                </div>
                <div className="font-display text-xl font-bold">VO2max · Double Threshold</div>
                <p className="text-ocean-200 text-sm mt-1.5">
                  Always double-threshold day — two quality sessions back-to-back, the Norwegian-method way. Free with the app.
                </p>
              </div>

              <div className="bg-white/5 border border-ocean-600/40 rounded-2xl p-5">
                <div className="flex items-center gap-2 text-ocean-300 text-xs font-bold uppercase tracking-wide mb-2">
                  <Bike className="w-4 h-4" /> Saturday
                </div>
                <div className="font-display text-xl font-bold">Bike + Run</div>
                <p className="text-ocean-200 text-sm mt-1.5">
                  Long ride, then run off the bike — brick work that makes race day feel easy. Free with the app.
                </p>
              </div>
            </div>

            <div className="text-center mt-6">
              <button
                onClick={() => setMode("signup")}
                className="inline-flex items-center gap-2 bg-emerald-500 hover:bg-emerald-400 text-white font-semibold rounded-xl px-6 py-2.5 text-sm transition-colors"
              >
                Start Training Free <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

        {/* Auth card */}
        <div className="max-w-md mx-auto bg-white text-slate-800 rounded-3xl shadow-2xl p-8">
          <div className="flex rounded-xl bg-sand-100 p-1 mb-6">
            {(["login", "signup"] as const).map((m) => (
              <button
                key={m}
                onClick={() => setMode(m)}
                className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-colors ${
                  mode === m ? "bg-ocean-600 text-white shadow" : "text-slate-500 hover:text-slate-800"
                }`}
              >
                {m === "login" ? "Log In" : "Create Account"}
              </button>
            ))}
          </div>

          <form onSubmit={submit} className="space-y-4">
            {mode === "signup" && (
              <div>
                <label className="label">Full name</label>
                <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Jasmel Acosta" required />
              </div>
            )}
            <div>
              <label className="label">Email</label>
              <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" required />
            </div>
            <div>
              <label className="label">Password</label>
              <input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" required minLength={8} />
            </div>
            {error && <div className="text-sm text-coral-600 bg-coral-50 rounded-lg px-3 py-2">{error}</div>}
            <button type="submit" disabled={busy} className="btn-primary w-full justify-center py-2.5">
              {busy ? "Please wait…" : mode === "login" ? "Log In" : "Start Training Free"}
            </button>
          </form>

          <p className="text-[11px] text-slate-400 mt-5 text-center">
            Free for athletes. Your data stays yours — blood, DNA and training records are private.
          </p>
        </div>

        <footer className="text-center text-ocean-400 text-xs py-10">
          © 2026 JasMiamiMethod · Built on post-2000 human performance research · Miami, FL
        </footer>
      </div>
    </div>
  );
}
