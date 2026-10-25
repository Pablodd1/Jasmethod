"use client";
import { useEffect, useState } from "react";
import type { LaunchChecks } from "@/lib/launch-integrations";

export function AdminIntegrationChecks() {
  const [checks, setChecks] = useState<LaunchChecks | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [checkedAt, setCheckedAt] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/admin/integrations", { signal: controller.signal, cache: "no-store" })
      .then(async response => { const data = await response.json(); if (!response.ok) throw new Error(data.error); setChecks(data.checks); setCheckedAt(data.checkedAt); })
      .catch(error => { if (error.name !== "AbortError") setError("Could not load integration checks."); });
    return () => controller.abort();
  }, []);
  async function run(action: "probe" | "configure_telegram_webhook") {
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/admin/integrations", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action }) });
      const data = await response.json(); if (!response.ok) throw new Error(data.error || "Integration check failed.");
      setChecks(data.checks); setCheckedAt(data.checkedAt);
    } catch (error) { setError(error instanceof Error ? error.message : "Integration check failed."); }
    finally { setBusy(false); }
  }
  return <details className="card space-y-3">
    <summary className="font-bold cursor-pointer">Email, Telegram and OpenAI readiness</summary>
    <p className="text-sm">Check the running deployment without revealing credentials. Athletes still control their own verification, pairing and communication consent.</p>
    {checks && <ul className="space-y-3">{Object.entries(checks).map(([key, check]) => <li key={key} className="text-sm">
      <strong>{key === "openai" ? "OpenAI" : key === "telegram" ? "Telegram" : "Email"}: {check.state}</strong>
      <p>{check.detail}</p>{!!check.missing?.length && <p className="text-amber-800 break-words">Missing: {check.missing.join(", ")}</p>}
      {check.botUsername && <p>Verified bot username: @{check.botUsername}</p>}
    </li>)}</ul>}
    <div className="flex flex-wrap gap-3">
      <button type="button" className="btn-secondary" disabled={busy} onClick={() => run("probe")}>Check SMTP and Telegram</button>
      <button type="button" className="btn-secondary" disabled={busy || !checks || checks.telegram.state === "missing" || checks.telegram.state === "conflict"} onClick={() => run("configure_telegram_webhook")}>Register JMM Telegram webhook</button>
      <a className="underline text-sm self-center" href="/account/smoke-test">Test my delivery</a>
    </div>
    {busy && <p role="status">Checking integrations…</p>}
    {error && <p role="alert" className="text-red-700">{error}</p>}
    {checkedAt && <p className="text-xs text-slate-500">Last checked: {new Date(checkedAt).toLocaleString()}</p>}
  </details>;
}
