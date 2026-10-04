"use client";
import { useEffect, useRef, useState } from "react";

export function PasswordRecovery({ reset = false }: { reset?: boolean }) {
  const [email, setEmail] = useState(""), [token, setToken] = useState("");
  const [password, setPassword] = useState(""), [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false), [message, setMessage] = useState(""), [error, setError] = useState(""), [done, setDone] = useState(false);
  const readFragment = useRef(false);
  useEffect(() => {
    if (!reset || readFragment.current) return;
    readFragment.current = true;
    const value = new URLSearchParams(window.location.hash.slice(1)).get("token") || "";
    setToken(value);
    window.history.replaceState(null, "", window.location.pathname);
    if (!value) setError("This link is missing its reset code. Request a new link.");
  }, [reset]);
  async function submit(event: React.FormEvent) {
    event.preventDefault(); setError(""); setMessage("");
    if (reset && password !== confirmation) { setError("The passwords do not match."); return; }
    if (reset && (password.length < 12 || new TextEncoder().encode(password).length > 72)) {
      setError("Use at least 12 characters and no more than 72 UTF-8 bytes."); return;
    }
    setBusy(true);
    try {
      const result = await fetch(`/api/auth/${reset ? "reset-password" : "forgot-password"}`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(reset ? { token, password } : { email }),
      });
      const body = await result.json();
      if (!result.ok) { setError(body.error || "Could not complete the request. Please try again."); return; }
      setMessage(reset ? "Your password is updated. Sign in again, then link Google or Apple to this same account." : body.message || "If an account matches this email, a reset link will be sent. Check your inbox and spam folder.");
      if (reset) { setDone(true); setToken(""); setPassword(""); setConfirmation(""); }
    } catch { setError("Connection failed. Please try again."); }
    finally { setBusy(false); }
  }
  return <section className="rounded-3xl border border-ink-200 bg-white p-6 sm:p-8 shadow-sm">
    <h1 className="font-display text-2xl font-bold">{reset ? "Choose your JMM password" : "Recover your JMM account"}</h1>
    <p className="mt-3 text-sm text-ink-600">{reset ? "This changes only your password. Your profile, training and linked sign-in options stay with your account." : "Enter the email of your existing account. Recovery keeps your training and profile in that account."}</p>
    {!done && <form onSubmit={submit} className="mt-6 space-y-4">
      {!reset ? <div><label htmlFor="recovery-email" className="block text-sm mb-1">Account email</label><input id="recovery-email" className="field-editorial" type="email" autoComplete="email" required value={email} onChange={e=>setEmail(e.target.value)} /></div> : <>
        <div><label htmlFor="recovery-password" className="block text-sm mb-1">New password (at least 12 characters)</label><input id="recovery-password" className="field-editorial" type="password" autoComplete="new-password" required minLength={12} value={password} onChange={e=>setPassword(e.target.value)} /></div>
        <div><label htmlFor="recovery-confirmation" className="block text-sm mb-1">Confirm new password</label><input id="recovery-confirmation" className="field-editorial" type="password" autoComplete="new-password" required value={confirmation} onChange={e=>setConfirmation(e.target.value)} /></div>
      </>}
      <button className="btn-editorial-accent w-full justify-center" disabled={busy || (reset && !token)}>{busy ? "Please wait…" : reset ? "Save new password" : "Request reset link"}</button>
    </form>}
    {error && <p role="alert" className="mt-4 text-sm text-red-700">{error}</p>}
    {message && <p role="status" className="mt-4 text-sm text-ink-700">{message}</p>}
    <div className="mt-5 flex flex-wrap gap-4 text-sm underline"><a href="/login">Sign in</a>{reset && <a href="/forgot-password">Request a new reset link</a>}<a href="/help">Get support</a></div>
  </section>;
}

export function AdminPasswordReset({ userId, email }: { userId: string; email: string }) {
  const [busy, setBusy] = useState(false), [message, setMessage] = useState(""), [error, setError] = useState("");
  async function send() {
    setBusy(true); setMessage(""); setError("");
    try {
      const result = await fetch(`/api/admin/users/${encodeURIComponent(userId)}/password-reset`, { method: "POST" });
      const body = await result.json();
      if (!result.ok) setError(body.error || "The reset email could not be sent.");
      else setMessage(`The mail server accepted a reset email for ${email}. Ask the user to check their inbox and spam folder; they choose their own password.`);
    } catch { setError("Connection failed. Please try again."); }
    finally { setBusy(false); }
  }
  return <section className="card space-y-3"><h2 className="font-bold">Account recovery</h2><p className="text-sm">Send a one-time password reset to this account’s saved email: {email}. Training data and roles stay unchanged.</p><button type="button" className="btn-primary" disabled={busy} onClick={send}>{busy ? "Sending…" : "Send password reset email"}</button>{message && <p role="status">{message}</p>}{error && <p role="alert" className="text-red-700">{error}</p>}</section>;
}
