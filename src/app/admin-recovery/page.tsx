"use client";

import { useState } from "react";
import { SiteHeader, SiteFooter } from "@/components/site-shell";
import { KeyRound } from "lucide-react";

// Owner-only recovery: set a new password for the admin account using the
// recovery token. The endpoint double-gates on ADMIN_RECOVERY_TOKEN and the
// ADMIN_EMAILS allowlist.
export default function AdminRecoveryPage() {
  const [token, setToken] = useState("");
  const [email, setEmail] = useState("jasmelacosta@gmail.com");
  const [password, setPassword] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/auth/admin-recovery", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, email, newPassword: password }),
      });
      const d = await res.json().catch(() => ({}));
      if (res.ok) {
        setMsg({ ok: true, text: "Password updated. Redirecting to sign in…" });
        setTimeout(() => (window.location.href = "/login"), 1500);
      } else {
        setMsg({ ok: false, text: d.error || "Recovery failed." });
      }
    } catch {
      setMsg({ ok: false, text: "Network error." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen bg-paper">
      <SiteHeader />
      <div className="pub-container py-12 sm:py-16">
        <div className="max-w-md">
          <h1 className="font-display text-2xl font-bold text-ink-900 flex items-center gap-2">
            <KeyRound className="w-6 h-6 text-vermillion-500" /> Account recovery
          </h1>
          <p className="text-sm text-ink-500 mt-2">
            Owner-only. Requires the recovery token and an allowlisted admin
            email.
          </p>
          <form onSubmit={submit} className="mt-6 space-y-4">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wide text-ink-500 mb-1">
                Recovery token
              </label>
              <input
                className="field-editorial font-mono"
                value={token}
                onChange={(e) => setToken(e.target.value)}
                placeholder="paste the recovery token"
                required
              />
            </div>
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wide text-ink-500 mb-1">
                Admin email
              </label>
              <input
                className="field-editorial"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wide text-ink-500 mb-1">
                New password (8+ characters)
              </label>
              <input
                className="field-editorial"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                minLength={8}
                required
              />
            </div>
            {msg && (
              <div
                className={`text-sm rounded-lg px-3 py-2 ${
                  msg.ok
                    ? "text-emerald-700 bg-emerald-50"
                    : "text-vermillion-600 bg-vermillion-400/10"
                }`}
              >
                {msg.text}
              </div>
            )}
            <button
              type="submit"
              disabled={busy}
              className="btn-editorial-accent w-full justify-center py-2.5"
            >
              {busy ? "Updating…" : "Set new password"}
            </button>
          </form>
        </div>
      </div>
      <SiteFooter />
    </div>
  );
}
