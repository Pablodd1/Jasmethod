"use client";

import { useEffect, useState } from "react";
import { Bell, Mail, Send, MessageCircle, Save } from "lucide-react";
import { ProtectedPage } from "@/components/gate";
import { useAuth } from "@/components/auth";

export default function RemindersPage() {
  const { user } = useAuth();
  const [prefs, setPrefs] = useState<any>({ emailEnabled: true, telegramEnabled: false, telegramChatId: "", reminderHour: "17", remindBeforeMin: "0" });
  const [telegramConfigured, setTelegramConfigured] = useState(false);
  const [saved, setSaved] = useState(false);
  const [sent, setSent] = useState<any>(null);
  const [busy, setBusy] = useState(false);

  async function load() {
    const res = await fetch("/api/reminders");
    const d = await res.json();
    setTelegramConfigured(d.telegramConfigured);
    if (d.prefs) setPrefs({ ...prefs, ...d.prefs, reminderHour: String(d.prefs.reminderHour ?? 6), remindBeforeMin: String(d.prefs.remindBeforeMin ?? 0) });
  }
  useEffect(() => { if (user) load(); }, [user]);

  const set = (k: string, v: any) => setPrefs((p: any) => ({ ...p, [k]: v }));

  async function save() {
    setBusy(true);
    await fetch("/api/reminders", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...prefs, reminderHour: parseInt(prefs.reminderHour, 10), remindBeforeMin: parseInt(prefs.remindBeforeMin, 10) }) });
    setBusy(false); setSaved(true); setTimeout(() => setSaved(false), 2500);
  }

  async function sendNow() {
    setBusy(true);
    const res = await fetch("/api/reminders/send", { method: "POST" });
    const d = await res.json();
    setSent(d);
    setBusy(false);
  }

  return (
    <ProtectedPage>
      <div className="space-y-6 max-w-2xl">
        <div>
          <h1 className="font-display text-2xl font-bold">Training Reminders</h1>
          <p className="text-slate-500 text-sm">Morning (hour &lt; 12): short reminder of today&apos;s session. Evening (hour ≥ 12, default 17:00): the full detailed plan for tomorrow + readiness recommendation — email and/or Telegram.</p>
        </div>

        {saved && <div className="text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">✓ Preferences saved</div>}
        {sent && <div className="text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">✓ Sent — {sent.result?.email?.ok ? "email ok" : sent.result?.email?.error || "email fallback (no SMTP)"}{sent.result?.telegram ? (sent.result.telegram.ok ? " · telegram ok" : ` · telegram: ${sent.result.telegram.error}`) : ""}</div>}

        <div className="card">
          <h2 className="font-display font-bold text-lg mb-3 flex items-center gap-2"><Bell className="w-5 h-5 text-ocean-500" /> Channels</h2>
          <div className="space-y-4">
            <label className="flex items-center gap-3 p-3 rounded-xl border border-sand-200">
              <input type="checkbox" checked={prefs.emailEnabled} onChange={(e) => set("emailEnabled", e.target.checked)} />
              <Mail className="w-5 h-5 text-ocean-500" />
              <div className="flex-1"><div className="font-semibold text-sm">Email</div><div className="text-xs text-slate-400">{user?.email}</div></div>
            </label>

            <label className="flex items-center gap-3 p-3 rounded-xl border border-sand-200">
              <input type="checkbox" checked={prefs.telegramEnabled} onChange={(e) => set("telegramEnabled", e.target.checked)} />
              <MessageCircle className="w-5 h-5 text-ocean-500" />
              <div className="flex-1"><div className="font-semibold text-sm">Telegram</div>
                {telegramConfigured ? <div className="text-xs text-slate-400">Chat ID:</div> : <div className="text-xs text-amber-600">Add TELEGRAM_BOT_TOKEN to the server to enable</div>}
              </div>
            </label>
            {prefs.telegramEnabled && (
              <div><label className="label">Telegram chat ID</label><input className="input" value={prefs.telegramChatId} onChange={(e) => set("telegramChatId", e.target.value)} placeholder="e.g. 123456789" /></div>
            )}
          </div>
        </div>

        <div className="card">
          <h2 className="font-display font-bold text-lg mb-3">Schedule</h2>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="label">Daily plan hour (0-23)</label><input type="number" min={0} max={23} className="input" value={prefs.reminderHour} onChange={(e) => set("reminderHour", e.target.value)} />
              <div className="text-[10px] text-slate-400 mt-1">17 = 5pm detailed plan for tomorrow. Pick a morning hour for a short today-reminder instead.</div>
            </div>
            <div><label className="label">Lead time (min)</label><input type="number" min={0} className="input" value={prefs.remindBeforeMin} onChange={(e) => set("remindBeforeMin", e.target.value)} /></div>
          </div>
          <button onClick={save} disabled={busy} className="btn-primary justify-center mt-4"><Save className="w-4 h-4" /> Save Preferences</button>
        </div>

        <div className="card bg-ocean-50 border-ocean-200">
          <p className="text-sm text-ocean-900 mb-3">Want today&apos;s reminder right now?</p>
          <button onClick={sendNow} disabled={busy} className="btn-secondary justify-center"><Send className="w-4 h-4" /> Send Now</button>
        </div>
      </div>
    </ProtectedPage>
  );
}
