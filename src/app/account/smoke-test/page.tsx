"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ProtectedPage } from "@/components/gate";

type Channel = { channel: string; label: string; reason: string | null; requiresVerification: boolean; destinationRevision: string; receipt: { status: string; receiptId: string | null; verificationPending?: boolean; verifiedAt?: string | null } | null };
const statusCopy: Record<string, string> = {
  provider_accepted: "Provider accepted. Inbox arrival, reading and device delivery are unverified.",
  processing: "Attempt recorded; provider outcome is pending. Do not resend.",
  unknown: "Outcome unknown. The provider may have accepted it. Automatic and manual resends are blocked.",
  rejected: "Provider rejected this attempt. No automatic retry is allowed.",
  cancelled: "Cancelled before sending because saved destination or consent changed.",
};
export default function AccountSmokeTestPage() {
  const [channels, setChannels] = useState<Channel[]>([]);
  const [version, setVersion] = useState("");
  const [error, setError] = useState("");
  const [code, setCode] = useState("");
  const [pairingUrl, setPairingUrl] = useState("");
  const [verificationNotice, setVerificationNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const inFlight = useRef(false);
  const generation = useRef(0);
  const load = useCallback(async () => {
    const request = ++generation.current;
    try {
      const response = await fetch("/api/account/smoke-test", { cache: "no-store", signal: AbortSignal.timeout(15000) });
      const data = await response.json();
      if (request !== generation.current) return;
      if (!response.ok) throw Error(data.error || "Status unavailable");
      setChannels(data.channels); setVersion(data.consentVersion); setError(""); setChecked({});
    } catch (e) { if (request === generation.current) { setChannels([]); setError(e instanceof Error ? e.message : "Status unavailable"); } }
  }, []);
  const cancelLoad = useCallback(() => { generation.current++; }, []);
  useEffect(() => { void load(); return cancelLoad; }, [load, cancelLoad]);
  async function send(channel: Channel) {
    if (inFlight.current || !checked[channel.channel] || channel.receipt || channel.reason) return;
    generation.current++;
    inFlight.current = true; setBusy(true); setError("");
    try {
      const response = await fetch("/api/account/smoke-test", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channel: channel.channel, consentVersion: version, destinationRevision: channel.destinationRevision }), signal: AbortSignal.timeout(25000) });
      const data = await response.json();
      if (data.receipt) setChannels(current => current.map(c => c.channel === channel.channel ? { ...c, receipt: data.receipt } : c));
      else throw Error(data.error || "Outcome could not be confirmed. Reload status; do not resend.");
    } catch (e) {
      setChannels(current => current.map(c => c.channel === channel.channel ? { ...c, receipt: { status: "unknown", receiptId: null } } : c));
      setError(e instanceof Error ? e.message : "Outcome unknown. Reload status; do not resend.");
    } finally { inFlight.current = false; setBusy(false); setChecked({}); }
  }
  async function setup(action: "pair" | "verify") {
    if (inFlight.current) return;
    generation.current++; inFlight.current = true; setBusy(true); setError("");
    try {
      const response = await fetch(`/api/account/smoke-test/${action === "pair" ? "telegram/pair" : "email/verify"}`, { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(action === "pair" ? { consentVersion: "telegram-smoke-pair-v1" } : { code: code.trim().toUpperCase() }), signal: AbortSignal.timeout(15000) });
      const data = await response.json(); if (!response.ok) throw Error(data.error || "Could not confirm this action");
      if (action === "pair") setPairingUrl(data.pairingUrl);
      else { setVerificationNotice(data.message); setCode(""); await load(); }
    } catch (e) { setError(e instanceof Error ? e.message : "Could not confirm this action"); }
    finally { inFlight.current = false; setBusy(false); }
  }
  return <ProtectedPage><main className="mx-auto max-w-2xl space-y-6 p-6">
    <Link href="/settings" className="underline">Back to settings</Link>
    <h1 className="text-2xl font-bold">Account delivery smoke test</h1>
    <p>One fixed “JMM SMOKE TEST” message per channel for your own account. No training data or attachments. This does not activate scheduled delivery or change workouts.</p>
    <p>Calendar creates one private, transparent five-minute event with no guests or reminders. You can remove it yourself in Google Calendar. No event is deleted by this test.</p>
    {error && <p role="alert">{error}</p>}
    {verificationNotice && <p role="status">{verificationNotice}</p>}
    <button type="button" disabled={busy} onClick={() => void load()} className="rounded border px-4 py-2 disabled:opacity-50">Refresh status</button>
    {channels.map(c => <section key={c.channel} className="space-y-3 rounded border p-4">
      <h2 className="text-lg font-semibold capitalize">{c.channel}</h2>
      <p>Destination: {c.label}</p>
      {c.requiresVerification && !c.receipt && <p>Your saved account email is not yet verified. This single labeled smoke-test email will contain a verification code. Enter it here to confirm receipt. No second test email will be sent.</p>}
      {c.reason && <p>{c.reason}</p>}
      {c.receipt ? <div role="status"><p>{c.receipt.verifiedAt ? `Email arrival confirmed by your code. Provider receipt status: ${c.receipt.status}. Device delivery is unverified.` : statusCopy[c.receipt.status] || "Unknown receipt state. Do not resend."}</p>{c.receipt.receiptId && <p>Receipt: {c.receipt.receiptId}</p>}{c.receipt.verifiedAt && <p>You confirmed receipt of this test email.</p>}</div> : <>
        <label className="flex items-start gap-2"><input type="checkbox" checked={!!checked[c.channel]} disabled={busy || !!c.reason} onChange={e => setChecked({ ...checked, [c.channel]: e.target.checked })} />
          I authorize this one {c.requiresVerification ? "verification and smoke-test email" : "fixed test"} to the saved destination shown above.</label>
        <button type="button" disabled={busy || !!c.reason || !checked[c.channel]} onClick={() => void send(c)} className="rounded border px-4 py-2 disabled:opacity-50">{busy ? "Working…" : `Send one ${c.channel} test`}</button>
      </>}
      {c.channel === "email" && c.receipt?.verificationPending && <form onSubmit={e => { e.preventDefault(); void setup("verify"); }} className="space-y-2">
        <label className="block">Smoke-test email code <input className="rounded border p-2" value={code} onChange={e => setCode(e.target.value)} maxLength={12} autoComplete="one-time-code" /></label>
        <button type="submit" disabled={busy || !/^[A-Fa-f0-9]{12}$/.test(code.trim())} className="rounded border px-4 py-2 disabled:opacity-50">Confirm receipt</button>
        <p>The code expires after 15 minutes and permits at most five attempts. Verification changes only this smoke-test receipt.</p>
      </form>}
      {c.channel === "telegram" && c.reason && !c.receipt && <div className="space-y-2">
        <p>Link your own private Telegram chat for this test only. Linking sends no bot message and enables no scheduled coaching.</p>
        <button type="button" disabled={busy} onClick={() => void setup("pair")} className="rounded border px-4 py-2">Create private Telegram pairing link</button>
        {pairingUrl && <p><a href={pairingUrl} target="_blank" rel="noopener noreferrer" className="underline">Open Telegram and press Start</a>. Then refresh this page’s status and separately authorize the test.</p>}
      </div>}
      {c.channel === "calendar" && c.reason && !c.receipt && <form method="post" action="/api/account/smoke-test/calendar/connect?mode=smoke" className="space-y-2">
        <input type="hidden" name="mode" value="smoke" /><input type="hidden" name="consent" value="calendar-smoke-v1" />
        <p>Connect a Google account whose primary calendar you own. Google will ask for permission to view and edit events on calendars you own. This test connection is separate from workout sync. Connecting does not create an event; sending above requires another confirmation.</p>
        <button className="rounded border px-4 py-2" type="submit" disabled={busy}>Review Google Calendar access</button>
      </form>}
    </section>)}
  </main></ProtectedPage>;
}
