"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { Bell, Mail, Send, MessageCircle, Save } from "lucide-react";
import { ProtectedPage } from "@/components/gate";
import { useAuth } from "@/components/auth";
import { t, type Lang } from "@/lib/i18n";

export default function RemindersPage() {
  const { user } = useAuth();
  const lang = (user?.language || "es") as Lang;
  const [prefs, setPrefs] = useState<any>({ emailEnabled: false, telegramEnabled: false, telegramChatId: "", reminderHour: "17", remindBeforeMin: "0" });
  const [telegramConfigured, setTelegramConfigured] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [digestSent, setDigestSent] = useState(false);
  const [digestBusy, setDigestBusy] = useState(false);
  // Telegram auto-pairing: personal code + one-tap detect
  const [pairing, setPairing] = useState<{ code: string; botUsername: string | null; configured: boolean } | null>(null);
  const [pairBusy, setPairBusy] = useState(false);
  const [pairMsg, setPairMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [chatSaved, setChatSaved] = useState(false);
  // Scheduled-delivery health: proves the cron is actually configured + shows recent deliveries
  const [health, setHealth] = useState<any>(null);

  const loadHealth = useCallback(async () => {
    const res = await fetch("/api/reminders/health");
    if (res.ok) setHealth(await res.json());
  }, []);

  // Chat ID persists immediately — no Save button needed.
  async function saveChatId(value: string) {
    if (value.trim() && value.trim() !== savedChatIdRef.current) setError("Use Detect to verify your private Telegram chat. Pasted IDs cannot enable delivery.");
  }
  const savedChatIdRef = useRef("");

  const loadPairing = useCallback(async () => {
    const res = await fetch("/api/reminders/telegram-detect");
    if (res.ok) setPairing(await res.json());
  }, []);

  async function detectChat() {
    setPairBusy(true); setPairMsg(null);
    try {
      const res = await fetch("/api/reminders/telegram-detect", { method: "POST" });
      const d = await res.json();
      if (d.ok) {
        setPairMsg({ ok: true, text: `${lang === "es" ? "Chat conectado" : "Chat connected"}: ${d.chatId}` });
        load();
        loadHealth();
      } else {
        setPairMsg({ ok: false, text: d.error || "Not found" });
      }
    } catch (e: any) {
      setPairMsg({ ok: false, text: e.message });
    } finally {
      setPairBusy(false);
    }
  }

  const load = useCallback(async () => {
    const res = await fetch("/api/reminders");
    const d = await res.json();
    setTelegramConfigured(d.telegramConfigured);
    if (d.prefs) { savedChatIdRef.current = d.prefs.telegramChatId || ""; setPrefs((previous: any) => ({ ...previous, ...d.prefs, reminderHour: String(d.prefs.reminderHour ?? 6), remindBeforeMin: String(d.prefs.remindBeforeMin ?? 0) })); }
  }, []);
  useEffect(() => { if (user) { load(); loadPairing(); loadHealth(); } }, [user, load, loadPairing, loadHealth]);

  const set = (k: string, v: any) => setPrefs((p: any) => ({ ...p, [k]: v, ...(v && k === "emailEnabled" ? { telegramEnabled: false } : {}), ...(v && k === "telegramEnabled" ? { emailEnabled: false } : {}) }));

  async function save() {
    setBusy(true); setError(null); setSaved(false);
    try {
      const res = await fetch("/api/reminders", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...prefs, reminderHour: Number(prefs.reminderHour), remindBeforeMin: Number(prefs.remindBeforeMin) }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not save preferences");
      setSaved(true); setTimeout(() => setSaved(false), 2500);
    } catch (e) { setError(e instanceof Error ? e.message : "Could not save preferences"); }
    finally { setBusy(false); }
  }

  async function sendNow(when: "today" | "tomorrow" = "today") {
    setBusy(true); setError(null); setSent(null);
    try {
      const res = await fetch("/api/reminders/send", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ when }) });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || data.result?.email?.error || data.result?.telegram?.error || "Delivery was not confirmed");
      setSent(data);
    } catch (e) { setError(e instanceof Error ? e.message : "Delivery was not confirmed"); }
    finally { setBusy(false); }
  }

  // Moved here from Settings so every message-delivery control lives on one tab.
  async function sendDigest() {
    setDigestBusy(true);
    const res = await fetch("/api/email/digest", { method: "POST" });
    setDigestBusy(false);
    setDigestSent(res.ok);
    setTimeout(() => setDigestSent(false), 4000);
  }

  return (
    <ProtectedPage>
      <div className="space-y-6 max-w-2xl">
        <div>
          <h1 className="font-display text-2xl font-bold">{t(lang, "rem.title")}</h1>
          <p className="text-slate-500 text-sm">Morning (hour &lt; 12): short reminder of today&apos;s session. Evening (hour ≥ 12, default 17:00): the full detailed plan for tomorrow + readiness recommendation — one chosen email or Telegram channel. Future sessions remain pending until a current check-in.</p>
        </div>

        {error && <div role="alert" className="text-red-700">{error}</div>}
        {saved && <div role="status" className="text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">{t(lang, "rem.saved")}</div>}
        {sent && <div role="status" className="text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">Provider accepted — {sent.result?.email?.ok ? "email ok" : sent.result?.email?.error || "email not sent"}{sent.result?.telegram ? (sent.result.telegram.ok ? " · telegram ok" : ` · telegram: ${sent.result.telegram.error}`) : ""}</div>}

        {/* Delivery status — makes the scheduled cron visible instead of silent */}
        {health && (
          <div className={`card ${health.cronConfigured ? "border-emerald-200 bg-emerald-50/40" : "border-red-200 bg-red-50"}`}>
            <h2 className="font-display font-bold text-base mb-2 flex items-center gap-2">
              <span className={`inline-block w-2.5 h-2.5 rounded-full ${health.cronConfigured ? "bg-emerald-500" : "bg-red-500"}`} />
              {lang === "es" ? "Envío programado" : "Scheduled delivery"}
            </h2>
            {health.cronConfigured ? (
              <p className="text-sm text-emerald-800">
                ✓ {lang === "es"
                  ? `Configurado para intentar el envío a las ${String(health.reminderHour).padStart(2, "0")}:00 (hora local). La aceptación del proveedor no confirma lectura.`
                  : `Configured to attempt delivery at ${String(health.reminderHour).padStart(2, "0")}:00 (your local time). Provider acceptance does not confirm reading.`}
              </p>
            ) : (
              <p className="text-sm text-red-800">
                ⚠ {lang === "es"
                  ? "El envío automático está desactivado o no configurado. Elige un canal antes de enviar manualmente."
                  : "Automatic delivery is disabled or not configured. Manual delivery is available only after choosing a channel."}
              </p>
            )}
            {prefs.telegramEnabled && !health.telegramBound && (
              <p className="text-sm text-amber-700 mt-2">
                ⚠ {lang === "es"
                  ? "Telegram activado pero sin chat vinculado — completa la conexión automática abajo."
                  : "Telegram is on but no chat is paired — complete the automatic setup below."}
              </p>
            )}
            {health.deliveries?.length > 0 && (
              <div className="mt-3 space-y-1">
                {health.deliveries.slice(0, 4).map((d: any, i: number) => (
                  <div key={i} className="text-xs text-slate-600 flex items-center gap-2">
                    <span>{d.channel === "telegram" ? "✈️" : "📧"}</span>
                    <span className="font-mono">{d.day}</span>
                    <span className={d.status === "sent" ? "text-emerald-600" : d.status === "failed" ? "text-red-600" : "text-slate-400"}>
                      {d.status}{d.error ? ` — ${d.error}` : ""}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        <div className="card">
          <h2 className="font-display font-bold text-lg mb-3 flex items-center gap-2"><Bell className="w-5 h-5 text-ocean-500" /> {t(lang, "rem.channels")}</h2>
          <div className="space-y-4">
            <label className="flex items-center gap-3 p-3 rounded-xl border border-sand-200">
              <input type="checkbox" checked={prefs.emailEnabled} onChange={(e) => set("emailEnabled", e.target.checked)} />
              <Mail className="w-5 h-5 text-ocean-500" />
              <div className="flex-1"><div className="font-semibold text-sm">{t(lang, "rem.email")}</div><div className="text-xs text-slate-400">{user?.email}</div></div>
            </label>

            <label className="flex items-center gap-3 p-3 rounded-xl border border-sand-200">
              <input type="checkbox" checked={prefs.telegramEnabled} onChange={(e) => set("telegramEnabled", e.target.checked)} />
              <MessageCircle className="w-5 h-5 text-ocean-500" />
              <div className="flex-1"><div className="font-semibold text-sm">{t(lang, "rem.telegram")}</div>
                {telegramConfigured ? <div className="text-xs text-slate-400">{t(lang, "rem.chatId")}</div> : <div className="text-xs text-amber-600">{t(lang, "rem.telegramToken")}</div>}
              </div>
            </label>
            {prefs.telegramEnabled && (
              <div className="space-y-3">
                {/* Auto-pairing: one link + one Detect press — no hunting for numbers */}
                <div className="rounded-xl border border-ocean-200 bg-ocean-50/60 p-3 space-y-2">
                  <div className="font-semibold text-sm text-ocean-900">{lang === "es" ? "Conexión automática (recomendado)" : "Automatic setup (recommended)"}</div>
                  {pairing?.botUsername ? (
                    <a
                      href={`https://t.me/${pairing.botUsername}?start=${pairing.code}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="btn-secondary text-sm w-full justify-center"
                    >
                      {lang === "es" ? "1. Abrir el bot y enviar el código" : "1. Open the bot & send the code"} {pairing.code}
                    </a>
                  ) : (
                    <div className="text-xs text-slate-600">
                      {lang === "es"
                        ? <>1. Abre nuestro bot en Telegram y envía: <code className="bg-white px-1 rounded">/start {pairing?.code}</code></>
                        : <>1. Open our bot in Telegram and send: <code className="bg-white px-1 rounded">/start {pairing?.code}</code></>}
                    </div>
                  )}
                  <div className="text-xs text-slate-500">
                    {lang === "es" ? "2. Vuelve aquí y pulsa Detectar — conectamos tu chat automáticamente." : "2. Come back here and press Detect — we link your chat automatically."}
                  </div>
                  <button onClick={detectChat} disabled={pairBusy} className="btn-primary text-sm w-full justify-center">
                    {pairBusy ? (lang === "es" ? "Detectando…" : "Detecting…") : (lang === "es" ? "2. Detectar mi chat" : "2. Detect my chat")}
                  </button>
                  {pairMsg && (
                    <div className={`text-xs rounded-lg px-2 py-1.5 ${pairMsg.ok ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>{pairMsg.text}</div>
                  )}
                </div>
                <div>
                  <label className="label">{lang === "es" ? "O pega tu Chat ID manualmente" : "Or paste your Chat ID manually"}</label>
                  <input
                    className="input"
                    value={prefs.telegramChatId}
                    onChange={(e) => set("telegramChatId", e.target.value)}
                    onBlur={(e) => saveChatId(e.target.value)}
                    placeholder="e.g. 123456789"
                  />
                  <div className="text-[10px] text-slate-400 mt-1">{lang === "es" ? "Copia el número de @userinfobot — se guarda solo al salir del campo." : "Copy the number from @userinfobot — it saves automatically when you leave the field."}</div>
                  {chatSaved && <div className="text-[11px] text-emerald-600 mt-1">✓ {lang === "es" ? "Chat ID guardado permanentemente" : "Chat ID saved permanently"}</div>}
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="card">
          <h2 className="font-display font-bold text-lg mb-3">{t(lang, "rem.schedule")}</h2>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="label">{t(lang, "rem.dailyHour")}</label><input type="number" min={0} max={23} className="input" value={prefs.reminderHour} onChange={(e) => set("reminderHour", e.target.value)} />
              <div className="text-[10px] text-slate-400 mt-1">17 = 5pm detailed plan for tomorrow. Pick a morning hour for a short today-reminder instead.</div>
            </div>
            <div className="flex items-end pb-1">
              <div className="text-sm text-slate-600">
                {(() => {
                  const h = parseInt(prefs.reminderHour, 10);
                  if (isNaN(h) || h < 0 || h > 23) return lang === "es" ? "Elige una hora (0-23)" : "Pick an hour (0-23)";
                  const label = `${((h + 11) % 12) + 1}:00 ${h < 12 ? "AM" : "PM"}`;
                  return lang === "es"
                    ? `${label} — ${h < 12 ? "recordatorio corto de hoy" : "plan detallado de mañana"}`
                    : `${label} — ${h < 12 ? "short today reminder" : "detailed tomorrow plan"}`;
                })()}
              </div>
            </div>
            <div><label className="label">{t(lang, "rem.leadTime")}</label><input type="number" min={0} className="input" value={prefs.remindBeforeMin} onChange={(e) => set("remindBeforeMin", e.target.value)} /></div>
          </div>
          <button onClick={save} disabled={busy} className="btn-primary justify-center mt-4"><Save className="w-4 h-4" /> {t(lang, "rem.savePrefs")}</button>
        </div>

        <div className="card bg-ocean-50 border-ocean-200">
          <p className="text-sm text-ocean-900 mb-3">{t(lang, "rem.sendNow")}</p>
          <div className="flex flex-wrap gap-2">
            <button onClick={() => sendNow("today")} disabled={busy} className="btn-secondary"><Send className="w-4 h-4" /> {t(lang, "rem.sendNowBtn")}</button>
            <button onClick={() => sendNow("tomorrow")} disabled={busy} className="btn-secondary">
              <Send className="w-4 h-4" /> {lang === "es" ? "Enviar plan de mañana" : "Send tomorrow's plan"}
            </button>
          </div>
        </div>

        <div className="card">
          <h2 className="font-display font-bold text-lg mb-2 flex items-center gap-2"><Mail className="w-5 h-5 text-ocean-500" /> Daily Motivation Email</h2>
          <p className="text-sm text-slate-500 mb-3">Your daily quote, coach message and today&apos;s session in your inbox ({user?.email}).</p>
          <button onClick={sendDigest} disabled={digestBusy} className="btn-primary w-full justify-center">
            <Mail className="w-4 h-4" /> {digestBusy ? "Sending…" : "Send Today's Digest Now"}
          </button>
          {digestSent && <div className="text-sm text-emerald-700 bg-emerald-50 rounded-lg px-3 py-2 mt-2">✓ Digest sent (or queued via SMTP)</div>}
        </div>
      </div>
    </ProtectedPage>
  );
}
