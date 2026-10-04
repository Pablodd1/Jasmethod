"use client";

import { useState } from "react";
import { useAuth } from "@/components/auth";
import { supportCategories, supportEmailDraft, type SupportCategory, type SupportContacts } from "@/lib/support-contact";

export function SupportContact({ contacts, telegramSupportAvailable }: { contacts: SupportContacts; telegramSupportAvailable: boolean }) {
  const { user } = useAuth();
  const [category, setCategory] = useState<SupportCategory>("login");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setStatus(""); setError("");
    try {
      const response = await fetch("/api/support", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ category, message }) });
      const result = await response.json();
      if (!response.ok || result.ok !== true) throw new Error(result.error || "Delivery could not be confirmed.");
      setStatus(result.message); setMessage("");
    } catch (failure) { setError(failure instanceof Error ? failure.message : "Delivery could not be confirmed."); }
    finally { setBusy(false); }
  }
  return <section className="card mt-8" aria-labelledby="contact-owner">
    <h2 id="contact-owner" className="font-display font-bold text-xl">Contact the JMM team</h2>
    <p className="text-sm text-slate-600 mt-2">For account problems, technical issues, and inquiries. These channels reach the JMM team. Training questions for the AI coach use the daily coaching conversation below.</p>
    <label htmlFor="support-category" className="block font-semibold text-sm mt-5">Topic</label>
    <select id="support-category" value={category} onChange={event => setCategory(event.target.value as SupportCategory)} className="mt-2 w-full rounded-lg border border-slate-300 bg-white p-3 text-slate-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-ocean-600">
      {Object.entries(supportCategories).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
    </select>
    <div className="flex flex-wrap gap-4 mt-5">
      {contacts.email && <a className="font-semibold underline text-ocean-700 focus-visible:outline focus-visible:outline-2" href={supportEmailDraft(contacts.email, category)}>Draft an email to {contacts.email}</a>}
      {contacts.telegramUsername && <a className="font-semibold underline text-ocean-700 focus-visible:outline focus-visible:outline-2" href={`https://t.me/${contacts.telegramUsername}`} target="_blank" rel="noopener noreferrer">Open Telegram @{contacts.telegramUsername}</a>}
    </div>
    {!contacts.email && !contacts.telegramUsername && !telegramSupportAvailable ? <p className="mt-4 text-sm text-slate-700">The administrator has not configured a support contact yet. Use the account recovery link above for password help.</p> : <p className="mt-4 text-sm text-slate-600">Email opens a draft in your email app. A Telegram contact link opens that contact. Opening either link does not send a message. Do not include passwords, verification codes, or health records.</p>}
    {telegramSupportAvailable && (user ? <form onSubmit={submit} className="mt-5 border-t pt-5">
      <label htmlFor="support-message" className="block font-semibold text-sm">Send an issue or question to the team</label>
      <p id="support-message-description" className="text-sm text-slate-600 mt-2">Your message, selected topic, and account email ({user.email}) will be sent to the existing JMM administrator Telegram channel. The team can reply by email. Training records are not attached.</p>
      <textarea id="support-message" aria-describedby="support-message-description" required minLength={10} maxLength={1500} rows={5} value={message} onChange={event => setMessage(event.target.value)} className="mt-3 w-full rounded-lg border border-slate-300 p-3 text-slate-900 focus-visible:outline focus-visible:outline-2" />
      <button type="submit" disabled={busy} className="mt-3 rounded-lg bg-ocean-700 px-5 py-3 text-white font-semibold disabled:opacity-60 focus-visible:outline focus-visible:outline-2">{busy ? "Sending…" : "Send to JMM team"}</button>
      {status && <p role="status" className="mt-3 text-sm text-slate-700">{status}</p>}
      {error && <p role="alert" className="mt-3 text-sm text-red-700">{error}</p>}
    </form> : <p className="mt-5 text-sm text-slate-700"><a href="/login" className="underline text-ocean-700">Sign in</a> to send a message directly to the existing JMM administrator Telegram channel. For login problems, use password recovery or the public email link if available.</p>)}
  </section>;
}
