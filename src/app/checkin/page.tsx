"use client";

import { useEffect, useRef, useState } from "react";
import { ClipboardCheck, Flame, Pill, Zap, Wind, ShoppingCart, BookOpen, HeartPulse, Mic, CheckCircle2, CalendarClock, Apple, Music, Plug, RefreshCw, Download, Upload, ExternalLink, Watch } from "lucide-react";
import { ProtectedPage } from "@/components/gate";
import { useAuth } from "@/components/auth";
import { t, type Lang } from "@/lib/i18n";
import { parseCheckinTranscript, VOICE_LANGUAGES, type VoiceCheckinAnswers } from "@/lib/voice-parse";
import { CognitiveCheck } from "@/components/cognitive-check";
import { Activity } from "lucide-react";

const QUESTIONS = [
  { key: "sleep", label: "Sleep quality last night", hint: "1 = terrible, 5 = great — hours matter but how you FEEL matters more" },
  { key: "mood", label: "Mood", hint: "1 = low, 5 = excellent — how you FEEL emotionally today (different from motivation)" },
  { key: "soreness", label: "Muscle soreness", hint: "1 = fresh legs, 5 = wrecked — legs, back, shoulders combined" },
  { key: "motivation", label: "Motivation", hint: "1 = none, 5 = fired up — want to train, not just should" },
  { key: "energy", label: "Energy", hint: "1 = drained, 5 = buzzing — overall, since waking" },
  { key: "stress", label: "Life stress", hint: "1 = calm, 5 = overwhelmed — work, family, money combined" },
];

// The voice script — read these aloud or tap Start Voice and answer in one go.
// Wording matches what the parser understands (voice-parse.ts).
const VOICE_SCRIPT = [
  "Sleep quality, one to five?",
  "Muscle soreness, one to five?",
  "Energy, one to five?",
  "Motivation, one to five?",
  "Life stress, one to five?",
  "Morning weight in kilograms? (e.g. \"seventy four point two\")",
  "Resting heart rate? (e.g. \"48\")",
  "HRV in milliseconds? (e.g. \"62\")",
  "Sleep hours last night? (e.g. \"seven point five\")",
  "Any sickness, injury, or menstrual phase today? (yes/no)",
];

function actualDetailValues(session: any): Record<string, number | null> {
  try { const parsed = JSON.parse(session.actualDetails || "null"); return parsed?.schemaVersion === 1 && parsed.values && typeof parsed.values === "object" ? parsed.values : {}; } catch { return {}; }
}

const VERDICT_COLOR: Record<string, string> = { full: "text-emerald-600", trim: "text-amber-600", easy: "text-orange-600", rest: "text-coral-600" };

export default function CheckinPage() {
  const { user } = useAuth();
  const lang = (user?.language || "es") as Lang;
  const [answers, setAnswers] = useState<any>({ sleep: "", mood: "", soreness: "", motivation: "", energy: "", stress: "", sick: "", newPain: "", urgentSymptoms: "", menstrual: "", weightKg: "", rhr: "", hrv: "", sleepHours: "", availableMinutes: "" });
  const [result, setResult] = useState<any>(null);
  const [previousSessions, setPreviousSessions] = useState<any[]>([]);
  const [feedbackDate, setFeedbackDate] = useState("");
  const [localToday, setLocalToday] = useState("");
  const [feedbackBusy, setFeedbackBusy] = useState<string | null>(null);
  const [feedbackMessage, setFeedbackMessage] = useState("");
  const feedbackRequest = useRef(0);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [listening, setListening] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [heard, setHeard] = useState<VoiceCheckinAnswers | null>(null);
  const [speechError, setSpeechError] = useState("");
  // Módulos integrados: provider list + sync state (collapses once 1 is connected)
  const [providers, setProviders] = useState<any[]>([]);
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState("");
  const [importing, setImporting] = useState<string | null>(null);
  const [downloaded, setDownloaded] = useState(false);
  const [selectedSessionId, setSelectedSessionId] = useState("");
  const recognition = useRef<any>(null);
  const voiceSupported = (VOICE_LANGUAGES as readonly string[]).includes(lang);
  useEffect(() => () => { if (recognition.current) { recognition.current.onend = null; recognition.current.abort(); } }, []);
  const [readiness, setReadiness] = useState<{ score: number; advice: string; deltaPct: number } | null>(null);

  function startVoice() {
    if (!voiceSupported) { setSpeechError("Voice extraction supports English and Spanish only. Use the text form."); return; }
    const SR: any = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) { setSpeechError(lang === "es" ? "Este navegador no admite voz. Usa el formulario." : "Voice isn't supported in this browser. Use the text form."); return; }
    const rec = new SR();
    recognition.current = rec;
    rec.lang = lang === "es" ? "es-ES" : "en-US";
    rec.interimResults = true;
    let finalText = "", failed = false, lowConfidence = false;
    rec.onresult = (e: any) => {
      let display = "";
      finalText = "";
      for (let i = 0; i < e.results.length; i++) {
        const result = e.results[i];
        display += `${result[0].transcript} `;
        if (result.isFinal) { finalText += `${result[0].transcript} `; if (result[0].confidence > 0 && result[0].confidence < 0.65) lowConfidence = true; }
      }
      setTranscript(display.trim());
    };
    rec.onerror = (e: any) => { failed = true; setListening(false); setHeard(null); setSpeechError(`Voice error: ${e.error}. No answers applied; use the form or try again.`); };
    rec.onend = () => {
      setListening(false);
      recognition.current = null;
      if (failed || !finalText.trim()) return;
      if (lowConfidence) { setSpeechError(lang === "es" ? "No se entendió con suficiente claridad. Confirma tus respuestas en el formulario." : "Speech wasn't clear enough. Enter and confirm your answers in the form."); return; }
      setHeard(parseCheckinTranscript(finalText.trim(), lang));
    };
    setListening(true); setSpeechError(""); setTranscript(""); setHeard(null);
    try { rec.start(); } catch { setListening(false); setSpeechError("Microphone could not start. Use the text form."); }
  }

  function applyHeard() {
    if (!heard || !heard.supportedLanguage) return;
    const fields = ["sleep", "soreness", "energy", "motivation", "stress", "weightKg", "rhr", "hrv", "sleepHours", "availableMinutes", "sick", "menstrual", "newPain", "urgentSymptoms"] as const;
    setAnswers((a: any) => {
      const next = { ...a, voiceReviewConfirmed: true };
      for (const field of fields) if (heard[field] !== undefined) next[field] = heard[field];
      return next;
    });
    setHeard(null); setTranscript("");
  }

  async function load() {
    const [res, cres] = await Promise.all([fetch("/api/checkin"), fetch("/api/connectors")]);
    const d = await res.json();
    if (!res.ok) throw new Error(d.error || "Could not load check-in");
    if (d.checkin?.answers) {
      try { const saved = JSON.parse(d.checkin.answers); setAnswers((current: any) => ({ ...current, ...Object.fromEntries(Object.entries(saved).map(([k, v]) => [k, v ?? ""])), availableMinutes: saved.availableMin ?? "" })); } catch { setErr("Saved answers could not be read. Please answer again."); }
    }
    if (d.checkin?.adaptation) setResult({ adaptation: JSON.parse(d.checkin.adaptation) });
    if (d.recovery || d.fuelBrands || d.sources) setResult((r: any) => ({ ...(r || {}), recovery: d.recovery, fuelBrands: d.fuelBrands, sources: d.sources }));
    setReadiness(d.readiness || null);
    setPreviousSessions(d.previousSessions || []); setFeedbackDate(d.feedbackDate || ""); setLocalToday(d.localToday || "");
    // Device modules — same list the connectors page uses
    if (cres.ok) {
      const cd = await cres.json();
      setProviders(cd.providers || []);
    }
  }
  useEffect(() => { if (user) void load().catch((e) => setErr(e.message)); }, [user]);

  const connectedCount = providers.filter((p) => p.status === "connected").length;

  // Real-time pull from every connected provider (existing /sync endpoint).
  async function syncDevices() {
    setSyncing(true); setSyncMsg(""); setErr("");
    try {
      const res = await fetch("/api/connectors/sync", { method: "POST" });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Sync failed");
      const outcomes = Array.isArray(d.synced) ? d.synced : [];
      setSyncMsg(outcomes.length ? outcomes.map((p: any) => `${p.provider}: ${p.ok ? "refresh completed" : "failed"}${p.error ? ` (${p.error})` : ""}`).join(" · ") : "No provider refresh confirmed.");
      await load();
    } catch (e: any) { setErr(e.message); } finally { setSyncing(false); }
  }

  // File import for athletes without a supported OAuth device.
  async function uploadImport(source: string) {
    const input = document.getElementById(`checkin-file-${source}`) as HTMLInputElement;
    const file = input?.files?.[0];
    if (!file) { setErr(`Choose a ${source} file first.`); return; }
    setImporting(source); setErr("");
    const fd = new FormData();
    fd.append("source", source);
    fd.append("file", file);
    try {
      const res = await fetch("/api/import", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Import failed");
      setSyncMsg(`${source}: ${data.workoutsImported ?? 0} workouts imported.`);
      input.value = "";
      load();
    } catch (e: any) { setErr(e.message); } finally { setImporting(null); }
  }

  // Manual download has no approval, email or device-delivery side effects.
  async function downloadWorkout() {
    if (!prescription?.sessionId) return;
    setBusy(true); setErr(""); setDownloaded(false);
    try {
      const res = await fetch(`/api/workout/approve?sessionId=${encodeURIComponent(prescription.sessionId)}`);
      if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.error || "Download unavailable"); }
      const blob = await res.blob();
      const name = (res.headers.get("Content-Disposition") || "").match(/filename="([^"]+)"/)?.[1] || "workout.fit";
      const a = document.createElement("a");
      const url = URL.createObjectURL(blob);
      a.href = url; a.download = name; a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setDownloaded(true);
    } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  }

  async function loadFeedbackDate(date: string) {
    const request = ++feedbackRequest.current;
    setFeedbackDate(date); setFeedbackMessage(""); setPreviousSessions([]);
    if (!date) { setPreviousSessions([]); return; }
    try {
      const res = await fetch(`/api/checkin?feedbackDate=${encodeURIComponent(date)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not load sessions");
      if (request === feedbackRequest.current) setPreviousSessions(data.previousSessions || []);
    } catch (e: any) { setErr(e.message); }
  }
  async function saveSessionFeedback(event: React.FormEvent<HTMLFormElement>, sessionId: string) {
    event.preventDefault(); setFeedbackBusy(sessionId); setErr(""); setFeedbackMessage("");
    const fields = Object.fromEntries(new FormData(event.currentTarget));
    const actualDetails = {
      distanceKm: fields.actualDistanceKm ? Number(fields.actualDistanceKm) : null,
      reps: fields.actualReps ? Number(fields.actualReps) : null,
      loadKg: fields.actualLoadKg ? Number(fields.actualLoadKg) : null,
    };
    delete fields.actualDistanceKm; delete fields.actualReps; delete fields.actualLoadKg;
    try {
      const res = await fetch("/api/plan", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sessionId, ...fields, actualSport: fields.actualSport || null, actualDetails }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not save feedback");
      await loadFeedbackDate(feedbackDate);
      setFeedbackMessage(lang === "es" ? "Informe guardado para esa sesión y fecha. Envía el check-in de hoy para actualizar la recomendación." : "Report saved for that session and date. Submit today's check-in to refresh the recommendation.");
    } catch (e: any) { setErr(e.message); } finally { setFeedbackBusy(null); }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setErr("");
    try {
      const res = await fetch("/api/checkin", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(answers) });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Failed");
      setResult(d); setDownloaded(false); setSelectedSessionId(d.prescriptions?.[0]?.sessionId || "");
    } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  }

  const setQ = (k: string, v: any) => setAnswers((a: any) => ({ ...a, [k]: v, voiceReviewConfirmed: false }));
  // Only render the adaptation card when a REAL verdict exists — on a fresh
  // day (no submitted check-in yet) `result` holds loading data (recovery,
  // fuel brands, readiness) but no adaptation, and verdict would be undefined.
  const adaptation = result?.adaptation?.verdict ? result.adaptation : null;
  const prescription = result?.prescriptions?.find((p: any) => p.sessionId === selectedSessionId) || result?.prescription;
  const fuel = result?.fuel;
  const ergos = result?.ergos?.recommended;
  const recovery = result?.recovery;
  const fuelBrands = result?.fuelBrands;
  const sources = result?.sources;

  return (
    <ProtectedPage>
      <div className="space-y-6">
        <div>
          <h1 className="font-display text-2xl font-bold">Daily Check-In</h1>
          <p className="text-slate-500 text-sm">Answer for today in your local timezone. Unknown answers are welcome; missing safety information keeps training on hold. No device is required.</p>
        </div>

        {err && <div role="alert" className="text-sm text-coral-600 bg-coral-50 rounded-lg px-3 py-2">{err}</div>}

        {/* Módulos integrados — device sync. Full until 1 device connects, then collapsed. */}
        <div className="card">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <h2 className="font-display font-bold text-lg flex items-center gap-2">
              <Plug className="w-5 h-5 text-ocean-500" /> Módulos integrados
              {connectedCount > 0 && (
                <span className="chip chip-z2 ml-1"><Watch className="w-3 h-3" /> {connectedCount} connected</span>
              )}
            </h2>
            {connectedCount > 0 ? (
              <div className="flex items-center gap-3">
                <button onClick={syncDevices} disabled={syncing} className="btn-secondary text-sm">
                  <RefreshCw className={`w-4 h-4 ${syncing ? "animate-spin" : ""}`} /> {syncing ? "Syncing…" : "Sync now"}
                </button>
                <a href="/connectors" className="text-xs text-ocean-600 underline">Manage devices</a>
              </div>
            ) : (
              <span className="text-xs text-slate-400">Connect a device to pull real biometrics, or skip and use the questionnaire. <a href="/connectors" className="text-ocean-600 underline">All devices &amp; file imports →</a></span>
            )}
          </div>
          {syncMsg && <div role="status" className="text-sm text-slate-700 bg-slate-50 rounded-lg px-3 py-2 mt-3">{syncMsg}</div>}
          {connectedCount === 0 && (
            <div className="grid md:grid-cols-2 gap-3 mt-3">
              {providers.map((p) => (
                <div key={p.id} className="rounded-xl border border-sand-200 p-3 flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-semibold text-sm">{p.name}</div>
                    <div className="text-[11px] text-slate-400 truncate">{p.method === "oauth" ? "Real-time pull" : "File import"}</div>
                  </div>
                  {p.method === "oauth" && p.configured && p.connectUrl ? (
                    <a href={p.connectUrl} className="btn-primary text-xs px-3 py-1.5 shrink-0"><ExternalLink className="w-3 h-3" /> Connect</a>
                  ) : p.method === "upload" || !p.configured ? (
                    <div className="flex items-center gap-1.5 shrink-0">
                      <input id={`checkin-file-${p.id}`} type="file" className="hidden" accept=".tcx,.xml,.csv" onChange={() => uploadImport(p.id)} />
                      <button onClick={() => document.getElementById(`checkin-file-${p.id}`)?.click()} disabled={importing === p.id} className="btn-secondary text-xs px-3 py-1.5">
                        <Upload className="w-3 h-3" /> {importing === p.id ? "…" : "Upload"}
                      </button>
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Consolidated from the former VFC/Recovery page: HRV readiness hero */}
        {readiness && adaptation?.safetyStatus === "clear" && (
          <div className={`rounded-3xl p-5 text-white ${readiness.score >= 65 ? "bg-gradient-to-r from-emerald-600 to-emerald-500" : readiness.score >= 40 ? "bg-gradient-to-r from-amber-500 to-amber-400" : "bg-gradient-to-r from-coral-600 to-coral-500"}`}>
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div>
                <div className="flex items-center gap-2 text-sm font-semibold opacity-90"><Activity className="w-4 h-4" /> {lang === "es" ? "Comparación derivada de VFC (no autorización para entrenar)" : "Derived HRV comparison (not training clearance)"}</div>
                <div className="font-display text-3xl font-extrabold mt-1">{readiness.score}/100</div>
                <div className="text-sm mt-0.5">{readiness.deltaPct >= 0 ? "▲" : "▼"} {Math.abs(readiness.deltaPct)}%</div>
              </div>
              <p className="text-sm leading-relaxed max-w-md opacity-95">{readiness.advice}</p>
            </div>
          </div>
        )}

        {/* Consolidated from the former Brain page: cognitive check lives here */}
        <CognitiveCheck lang={lang} />

        <section className="card space-y-3" aria-labelledby="previous-session-heading">
          <h2 id="previous-session-heading" className="font-display font-bold text-lg">{lang === "es" ? "Ayer: ¿qué hiciste realmente?" : "Yesterday: what did you actually do?"}</h2>
          <p className="text-xs text-slate-600">{lang === "es" ? "Selecciona cada sesión. Puedes cambiar la fecha para corregir un informe anterior. La fecha observada se conserva separada del momento de registro." : "Report each session separately. Change the date to correct an earlier report. The observation date stays separate from entry time."}</p>
          <label className="block text-sm">{lang === "es" ? "Fecha local observada" : "Local observation date"}<input className="input" type="date" max={localToday || undefined} value={feedbackDate} onChange={(e) => void loadFeedbackDate(e.target.value)} /></label>
          {previousSessions.length === 0 && <p className="text-sm text-slate-600">{lang === "es" ? "No hay sesiones registradas para esta fecha. No se supone que descansaste ni que tu carga fue cero." : "No sessions are recorded for this date. This does not mean you rested or had zero activity."}</p>}
          {previousSessions.map((session: any) => (
            <form key={`${session.id}:${session.feedbackAt || "new"}`} onSubmit={(e) => void saveSessionFeedback(e, session.id)} className="rounded-xl border border-sand-200 p-3 space-y-3">
              <h3 className="font-semibold">{session.title}</h3>
              <p className="text-xs text-slate-600">{lang === "es" ? "Planificado" : "Planned"}: {session.sport} · {session.durationMin} min · {feedbackDate}</p>
              <div className="grid sm:grid-cols-2 gap-3">
                <label className="text-sm">{lang === "es" ? "Resultado real" : "Actual outcome"}<select name="feedbackStatus" className="input" defaultValue={session.feedbackStatus || "unknown"}>{([ ["unknown", "Unknown / No sé"], ["completed", "Completed / Completada"], ["partial", "Partly completed / Parcial"], ["substituted", "Substituted / Sustituida"], ["skipped", "Skipped / Omitida"] ] as const).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
                <label className="text-sm">{lang === "es" ? "Deporte realizado (si es distinto)" : "Actual sport (if different)"}<select name="actualSport" className="input" defaultValue={session.actualSport || ""}><option value="">{lang === "es" ? "Sin indicar" : "Not reported"}</option>{["run", "bike", "swim", "strength", "mobility", "recovery", "brick", "hyrox", "other"].map((sport) => <option key={sport} value={sport}>{sport}</option>)}</select></label>
                <label className="text-sm">{lang === "es" ? "Minutos reales (opcional)" : "Actual minutes (optional)"}<input name="actualDurationMin" className="input" type="number" min={0} max={1440} step={1} placeholder="—" defaultValue={session.actualDurationMin ?? ""} /></label>
                <label className="text-sm">{lang === "es" ? "Esfuerzo de toda la sesión, 1–10 (opcional)" : "Whole-session exertion, 1–10 (optional)"}<input name="rpe" className="input" type="number" min={1} max={10} step={1} placeholder="—" defaultValue={session.rpe ?? ""} /><span className="text-xs text-slate-500">{lang === "es" ? "1 muy fácil · 3 fácil · 5 moderado · 7 duro · 10 máximo" : "1 very easy · 3 easy · 5 moderate · 7 hard · 10 maximal"}</span></label>
              </div>
              <div className="grid sm:grid-cols-3 gap-3">
                <label className="text-sm">{lang === "es" ? "Distancia real (km, opcional)" : "Actual distance (km, optional)"}<input name="actualDistanceKm" className="input" type="number" min={0} max={1500} step="any" placeholder="—" defaultValue={actualDetailValues(session).distanceKm ?? ""} /></label>
                <label className="text-sm">{lang === "es" ? "Repeticiones reales (opcional)" : "Actual repetitions (optional)"}<input name="actualReps" className="input" type="number" min={0} max={100000} step={1} placeholder="—" defaultValue={actualDetailValues(session).reps ?? ""} /></label>
                <label className="text-sm">{lang === "es" ? "Carga realizada (kg, opcional)" : "Actual load (kg, optional)"}<input name="actualLoadKg" className="input" type="number" min={0} max={1500} step="any" placeholder="—" defaultValue={actualDetailValues(session).loadKg ?? ""} /></label>
              </div>
              <label className="block text-sm">{lang === "es" ? "Cambios en intervalos/descansos, distancia/repeticiones/carga si se conocen; tolerancia, dolor y cuándo ocurrió" : "Interval/recovery changes, distance/reps/load if known; tolerance, pain and when it occurred"}<textarea name="feedbackNote" maxLength={4000} className="input" defaultValue={session.feedbackNote || ""} /></label>
              <p className="text-xs text-slate-600">{lang === "es" ? "Informa síntomas actuales también en las preguntas de seguridad de hoy. Las notas de sesiones no son un diagnóstico." : "Also report current symptoms in today's safety questions. Session notes are not a diagnosis."}</p>
              <button type="submit" disabled={feedbackBusy === session.id} className="btn-secondary">{feedbackBusy === session.id ? "Saving…" : lang === "es" ? "Guardar informe de esta sesión" : "Save this session report"}</button>
            </form>
          ))}
          {feedbackMessage && <p role="status" className="text-sm text-ocean-700">{feedbackMessage}</p>}
          <a className="text-sm underline" href="/calendar">{lang === "es" ? "Añadir actividad no planificada o revisar el calendario" : "Add unplanned activity or review the calendar"}</a>
        </section>

        {/* Voice check-in */}
        <div className="card bg-ocean-50 border-ocean-200">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <h2 className="font-display font-bold text-lg flex items-center gap-2"><Mic className="w-5 h-5 text-ocean-600" /> Voice Check-In</h2>
              <p className="text-xs text-slate-500 mt-0.5">{lang === "es" ? "Español e inglés. Ejemplo: sueño 4, agujetas 2, energía 3, motivación 4, estrés 2, peso 74 kilos. Revisa y edita todo antes de aplicar." : "English and Spanish. Example: sleep 4, soreness 2, energy 3, motivation 4, stress 2, weight 74 kilograms. Review and edit every answer before applying."}</p>
            </div>
            <button onClick={() => listening ? recognition.current?.stop() : startVoice()} disabled={!voiceSupported} className={`btn-primary ${listening ? "opacity-70" : ""}`}>
              <Mic className="w-4 h-4" /> {listening ? (lang === "es" ? "Detener y revisar" : "Stop and review") : (lang === "es" ? "Iniciar voz" : "Start Voice")}
            </button>
          </div>
          <p className="text-xs text-slate-600 mt-2">{lang === "es" ? "Al iniciar, se solicita acceso al micrófono. El servicio de voz de tu navegador puede procesar el audio. JMM no guarda audio ni transcripciones; solo las respuestas que confirmas al enviar." : "Starting requests microphone permission. Your browser's speech service may process audio. JMM does not store raw audio or transcripts; only answers you confirm and submit are saved."}</p>
          {!voiceSupported && <p role="status" className="text-xs text-amber-700">Voice extraction is available only in English and Spanish. Use the text form for other languages.</p>}
          <details className="mt-2">
            <summary className="text-xs font-semibold text-ocean-700 cursor-pointer select-none">📋 Question script — read these in order (tap to expand)</summary>
            <ol className="text-xs text-slate-600 mt-2 space-y-1 list-decimal list-inside">
              {(lang === "es" ? ["Sueño, agujetas, energía, motivación y estrés: de uno a cinco.", "Peso en kilos, pulso en reposo, VFC y horas de sueño, solo si los sabes.", "¿Enfermedad, dolor nuevo o síntomas de alarma hoy?", "Minutos disponibles hoy. Revisa las respuestas antes de enviar."] : VOICE_SCRIPT).map((q) => <li key={q}>{q}</li>)}
            </ol>
            <p className="text-[11px] text-slate-400 mt-1.5">One breath, one number. The full transcript gets parsed automatically — you&apos;ll confirm before it applies.</p>
          </details>
          {listening && <div className="text-xs text-ocean-700 mt-2 animate-pulse">● Recording — say your answers, then pause.</div>}
          {transcript && <p className="text-sm text-slate-600 mt-2 italic border-l-2 border-ocean-300 pl-2">“{transcript}”</p>}
          {speechError && <p className="text-xs text-amber-700 mt-2">{speechError}</p>}

          {heard && (
            <div className="mt-3 rounded-xl bg-white border border-ocean-200 p-3">
              <h3 className="font-semibold text-sm mb-2">{lang === "es" ? "Revisa y edita las respuestas propuestas" : "Review and edit candidate answers"}</h3>
              {heard.warnings.length > 0 && <ul role="alert" className="text-xs text-amber-800 mb-3">{heard.warnings.map((w) => <li key={w}>{w}</li>)}</ul>}
              <div className="grid grid-cols-2 gap-3 text-xs">
                {([ ["sleep", "Sleep / Sueño (1–5)"], ["soreness", "Soreness / Agujetas (1–5)"], ["energy", "Energy / Energía (1–5)"], ["motivation", "Motivation / Motivación (1–5)"], ["stress", "Stress / Estrés (1–5)"], ["weightKg", "Weight / Peso (kg)"], ["rhr", "Resting HR / Pulso (bpm)"], ["hrv", "HRV / VFC (ms)"], ["sleepHours", "Sleep / Sueño (h)"], ["availableMinutes", "Available / Disponible (min)"] ] as const).map(([key, label]) => (
                  <label key={key}>{label}<input type="number" step="any" className="input" value={heard[key] ?? ""} placeholder="—" onChange={(e) => setHeard({ ...heard, [key]: e.target.value === "" ? undefined : Number(e.target.value) })} /></label>
                ))}
                {([ ["sick", "Illness / Enfermedad"], ["newPain", "New pain / Dolor nuevo"], ["urgentSymptoms", "Urgent symptoms / Síntomas de alarma"], ["menstrual", "Menstrual phase / Fase menstrual"] ] as const).map(([key, label]) => (
                  <label key={key}>{label}<select className="input" value={heard[key] === undefined ? "" : String(heard[key])} onChange={(e) => setHeard({ ...heard, [key]: e.target.value === "" ? undefined : e.target.value === "true" })}><option value="">Unknown / No sé</option><option value="false">No</option><option value="true">Yes / Sí</option></select></label>
                ))}
              </div>
              <p className="text-xs text-slate-600 mt-2">{lang === "es" ? "Confirma fechas, síntomas, valores y unidades. Lo no entendido se deja sin contestar. Enviar el formulario guarda tus respuestas." : "Confirm dates, symptoms, values and units. Unrecognized answers stay unanswered. Submitting the form saves your answers."}</p>
              <button onClick={applyHeard} className="btn-primary text-xs px-4 py-2 mt-2">{lang === "es" ? "He revisado las respuestas: aplicar" : "I reviewed these answers: apply"}</button>
              <button onClick={() => { setHeard(null); setTranscript(""); }} className="btn-secondary text-xs ml-2">{lang === "es" ? "Descartar" : "Discard"}</button>
            </div>
          )}
        </div>

        <div className="grid md:grid-cols-2 gap-6">
          <div className="card">
            <h2 className="font-display font-bold text-lg mb-3 flex items-center gap-2"><ClipboardCheck className="w-5 h-5 text-ocean-500" /> Questionnaire</h2>
            <form onSubmit={submit} className="space-y-4">
              {QUESTIONS.map((q) => (
                <div key={q.key}>
                  <label className="label" htmlFor={`answer-${q.key}`}>{q.label}</label>
                  <select id={`answer-${q.key}`} className="input" value={answers[q.key] ?? ""} onChange={(e) => setQ(q.key, e.target.value)}>
                    <option value="">{lang === "es" ? "No sé / prefiero no responder" : "Unknown / prefer not to answer"}</option>
                    {[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n}</option>)}
                  </select>
                  <div className="text-[11px] text-slate-400">{q.hint}</div>
                </div>
              ))}
              {([ ["sick", lang === "es" ? "¿Enfermedad, fiebre u otros síntomas hoy?" : "Illness, fever or other illness symptoms today?"], ["urgentSymptoms", lang === "es" ? "¿Molestias en el pecho, desmayo, falta de aire grave sin explicación, confusión o colapso actualmente?" : "Current chest discomfort, fainting, severe unexplained breathlessness, confusion or collapse?"], ["menstrual", lang === "es" ? "Fase menstrual (opcional; no reduce la preparación por sí sola)" : "Menstrual phase (optional; does not reduce readiness by itself)"] ] as const).map(([key, label]) => (
                <label key={key} className="block text-sm">{label}<select className="input mt-1" value={typeof answers[key] === "boolean" ? String(answers[key]) : ""} onChange={(e) => setQ(key, e.target.value === "" ? "" : e.target.value === "true")}><option value="">{lang === "es" ? "No sé / prefiero no responder" : "Unknown / prefer not to answer"}</option><option value="false">No</option><option value="true">{lang === "es" ? "Sí" : "Yes"}</option></select></label>
              ))}
              {answers.urgentSymptoms === true && <p role="alert" className="text-sm text-coral-700">{lang === "es" ? "Detén el ejercicio. Busca atención médica urgente; si los síntomas son graves o continúan, contacta emergencias locales ahora." : "Stop exercise. Seek urgent medical assessment; if symptoms are severe or ongoing, contact local emergency services now."}</p>}
              <label className="flex items-center gap-2 text-sm">
                Cycle day (1-35):
                <input type="number" min={1} max={35} value={answers.cycleDay || ""} onChange={(e) => setQ("cycleDay", e.target.value)} className="input w-20 !py-1 !px-2 text-xs" placeholder="—" />
              </label>

              {/* Device-free daily loop — the three questions that make the
                  session fit real life (Saw 2015 self-report monitoring). */}
              <div className="rounded-xl border border-ocean-200 bg-ocean-50/50 p-3 space-y-3">
                <div className="text-xs font-bold uppercase tracking-wide text-ocean-700">
                  {lang === "es" ? "Tu día real" : "Your real day"}
                </div>
                <div>
                  <label className="label">{lang === "es" ? "¿Cuántos minutos disponibles te quedan hoy?" : "How many available training minutes remain today?"}</label>
                  <input
                    type="number" min={0} max={600} step={5}
                    className="input"
                    value={answers.availableMinutes ?? ""}
                    onChange={(e) => setQ("availableMinutes", e.target.value)}
                    placeholder={lang === "es" ? "p.ej. 45" : "e.g. 45"}
                  />
                  <div className="text-[11px] text-slate-400">
                    {lang === "es"
                      ? "La sesión se ajusta a este tiempo — 0 significa que no se prescribe entrenamiento."
                      : "The session is fitted to this window — 0 means no workout is prescribed."}
                  </div>
                </div>
                <div>
                  <label className="block text-sm">
                    {lang === "es" ? "¿Dolor nuevo o que empeora en un punto concreto? (distinto de agujetas generales)" : "Any new or worsening pain in a specific spot? (different from general soreness)"}
                    <select className="input mt-1" value={typeof answers.newPain === "boolean" ? String(answers.newPain) : ""} onChange={(e) => setQ("newPain", e.target.value === "" ? "" : e.target.value === "true")}><option value="">{lang === "es" ? "No sé / prefiero no responder" : "Unknown / prefer not to answer"}</option><option value="false">No</option><option value="true">{lang === "es" ? "Sí" : "Yes"}</option></select>
                  </label>
                  {answers.newPain === true && (
                    <div className="mt-2 space-y-2 pl-6">
                      <input
                        className="input"
                        aria-label={lang === "es" ? "Lugar del dolor" : "Pain location"} value={answers.painLocation ?? ""}
                        onChange={(e) => setQ("painLocation", e.target.value)}
                        placeholder={lang === "es" ? "¿Dónde? p.ej. rodilla izquierda" : "Where? e.g. left knee"}
                      />
                      <label className="flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={answers.painAffectsMovement === true}
                          onChange={(e) => setQ("painAffectsMovement", e.target.checked)}
                        />
                        {lang === "es" ? "¿Cambia tu forma de moverte?" : "Does it change how you move?"}
                      </label>
                    </div>
                  )}
                </div>
                <div>
                  <label className="label">{lang === "es" ? "La sesión de ayer se sintió…" : "Yesterday's session felt…"}</label>
                  <select
                    className="input"
                    value={answers.sessionFelt ?? ""}
                    onChange={(e) => setQ("sessionFelt", e.target.value)}
                  >
                    <option value="">{lang === "es" ? "— no contestar —" : "— skip —"}</option>
                    <option value="easier">{lang === "es" ? "Más fácil de lo esperado" : "Easier than expected"}</option>
                    <option value="normal">{lang === "es" ? "Como se esperaba" : "As expected"}</option>
                    <option value="harder">{lang === "es" ? "Más dura de lo esperado" : "Harder than expected"}</option>
                  </select>
                  <div className="text-[11px] text-slate-400">
                    {lang === "es"
                      ? "Detecta si la dosis actual es demasiado grande."
                      : "Detects whether the current dose is too big."}
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Morning weight (kg)</label>
                  <input type="number" step="0.1" className="input" value={answers.weightKg} onChange={(e) => setQ("weightKg", e.target.value)} placeholder="e.g. 74.0" />
                  <div className="text-[11px] text-slate-400">Same scale, after bathroom, before food — trend matters more than the number.</div>
                </div>
                <div>
                  <label className="label">Resting HR (bpm)</label>
                  <input type="number" className="input" value={answers.rhr} onChange={(e) => setQ("rhr", e.target.value)} placeholder="e.g. 48" />
                  <div className="text-[11px] text-slate-400">Before coffee, still in bed. +6 over baseline = back off.</div>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">HRV (RMSSD, ms)</label>
                  <input type="number" step="0.1" className="input" value={answers.hrv} onChange={(e) => setQ("hrv", e.target.value)} placeholder="e.g. 62" />
                  <div className="text-[11px] text-slate-400">RMSSD = the standard morning recovery number (ms) your watch app reports. Within 5 min of waking; a drop below your 7-day baseline = back off.</div>
                </div>
                <div>
                  <label className="label">Sleep hours last night</label>
                  <input type="number" step="0.1" className="input" value={answers.sleepHours} onChange={(e) => setQ("sleepHours", e.target.value)} placeholder="e.g. 7.5" />
                  <div className="text-[11px] text-slate-400">Reported or from your device. Under 7h — prioritize an early night.</div>
                </div>
              </div>
              <p className="text-xs text-slate-600">{lang === "es" ? "Para registrar duración real, esfuerzo y finalización de cada sesión, selecciona la sesión en Hoy o Calendario." : "To report actual duration, exertion and completion for each session, select it in Today or Calendar."} <a className="underline" href="/today">{lang === "es" ? "Ver sesiones" : "Open sessions"}</a></p>
              <button type="submit" disabled={busy} className="btn-primary w-full justify-center"><Zap className="w-4 h-4" /> {busy ? "Checking…" : "Get Today's Plan"}</button>
            </form>
          </div>

          <div className="space-y-4">
            {result?.rejectedSessions?.map((session: any) => <p key={session.sessionId} role="alert" className="text-sm text-coral-700">{session.reason}</p>)}
            {adaptation && (
              <div className="card">
                <h3 className="font-display font-bold mb-2">Today&apos;s Adaptation</h3>
                <div className={`font-display text-2xl font-bold ${VERDICT_COLOR[adaptation.verdict] || ""}`}>
                  {t(lang, `adapt.${adaptation.verdict}`)} · {adaptation.scoreAvailable === false ? (lang === "es" ? "— datos insuficientes o pausa de seguridad" : "— unavailable") : `${adaptation.score}/100 (self-report heuristic)`}
                </div>
                <p className="text-sm text-slate-600 mt-1">{adaptation.message}</p>
                <div className="text-xs text-slate-400 mt-2">Duration ×{adaptation.durationFactor} · intensity cap {adaptation.intensityCap}</div>
                <a href="/onboarding#evaluation" className="text-xs text-ocean-600 underline mt-2 inline-block">What do Full / Trim / Easy / Rest mean?</a>
              </div>
            )}

            {result?.tomorrowAdjustment && (
              <div className="card border-amber-200 bg-amber-50">
                <h3 className="font-display font-bold mb-1 flex items-center gap-2"><CalendarClock className="w-4 h-4 text-amber-600" /> Tomorrow already adapted</h3>
                <div className="text-sm font-semibold text-amber-900">{result.tomorrowAdjustment.title} → {result.tomorrowAdjustment.durationMin} min</div>
                <p className="text-xs text-amber-800 mt-1">{result.tomorrowAdjustment.note}</p>
              </div>
            )}
            {prescription && (
              <div className="card border-ocean-300 bg-ocean-50">
                <h3 className="font-display font-bold mb-1 flex items-center gap-2"><ClipboardCheck className="w-4 h-4 text-ocean-600" /> Today&apos;s prescription — just execute</h3>
                <div className="font-semibold text-sm text-ocean-900">{prescription.title} · {prescription.durationMin} min</div>
                {prescription.targets.hr && <div className="text-xs text-ocean-700 mt-0.5">HR target: {prescription.targets.hr} · RPE {prescription.targets.rpe}/10 <span className="text-ocean-400">(how hard it feels)</span></div>}
                {prescription.targets.pace && <div className="text-xs text-ocean-700">Pace: {prescription.targets.pace}</div>}
                {prescription.targets.power && <div className="text-xs text-ocean-700">Power: {prescription.targets.power}</div>}
                <div className="text-[11px] text-ocean-500 mt-1">{prescription.scaled.reason}</div>
                <div className="mt-3 space-y-2 text-sm">
                  <div><span className="font-semibold text-ocean-800">Warm-up:</span> <span className="text-slate-700">{prescription.detail.wu}</span></div>
                  <div><span className="font-semibold text-ocean-800">Main:</span> <span className="text-slate-700">{prescription.detail.main}</span></div>
                  <div><span className="font-semibold text-ocean-800">Cool-down:</span> <span className="text-slate-700">{prescription.detail.cd}</span></div>
                  <div><span className="font-semibold text-ocean-800">Recovery:</span> <span className="text-slate-700">{prescription.detail.breathing}</span></div>
                  <div><span className="font-semibold text-ocean-800">Study:</span> <span className="text-slate-700">{prescription.detail.study}</span></div>
                </div>
                <div className="mt-2 flex flex-wrap gap-1">
                  {prescription.sources.map((s: string) => <span key={s} className="text-[10px] bg-ocean-100 text-ocean-700 rounded-full px-2 py-0.5">{s}</span>)}
                </div>
                {result?.prescriptions?.length > 1 && <label className="block text-sm mt-3">{lang === "es" ? "Sesión" : "Session"}<select className="input" value={selectedSessionId} onChange={(e) => { setSelectedSessionId(e.target.value); setDownloaded(false); }}>{result.prescriptions.map((p: any) => <option key={p.sessionId} value={p.sessionId}>{p.title}</option>)}</select></label>}
                {prescription.durationMin > 0 && <button onClick={downloadWorkout} disabled={busy} className="btn-primary w-full justify-center mt-3"><Download className="w-4 h-4" />{busy ? "Preparing…" : "Download workout (.FIT)"}</button>}
                {downloaded && <p role="status" className="mt-2 text-sm">File download started. Device import and receipt are not verified.</p>}
                {prescription.durationMin > 0 && <p className="text-xs mt-2">Manual transfer and model compatibility vary. <a className="underline" href="/today">Review this session and transfer instructions</a></p>}
              </div>
            )}

            {result?.cycle && (
              <div className="card border-rose-200 bg-rose-50">
                <h3 className="font-display font-bold mb-1 flex items-center gap-2"><HeartPulse className="w-4 h-4 text-rose-500" /> Cycle-aware coaching · {result.cycle.label}</h3>
                <div className="text-xs text-rose-600 mb-1">Strength: {result.cycle.strength} · Endurance: {result.cycle.endurance} · Protein: {result.cycle.proteinPerKg.toFixed(1)} g/kg</div>
                <p className="text-sm text-rose-800">{result.cycle.trainingNote}</p>
              </div>
            )}

            {result?.protein && (
              <div className="card">
                <h3 className="font-display font-bold mb-1 flex items-center gap-2"><Apple className="w-4 h-4 text-emerald-500" /> Protein target</h3>
                <p className="text-sm text-slate-600">{result.protein.note}</p>
              </div>
            )}

            {result?.youth && !result.youth.allowed && (
              <div className="card border-coral-300 bg-coral-50">
                <h3 className="font-display font-bold mb-1">Age policy</h3>
                <p className="text-sm text-coral-800">{result.youth.note}</p>
              </div>
            )}

            {result?.calendar?.busyCount > 0 && result?.calendar?.busyNote && (
              <div className="card border-amber-200 bg-amber-50">
                <h3 className="font-display font-bold mb-2 flex items-center gap-2"><CalendarClock className="w-4 h-4 text-amber-600" /> Calendar-aware coaching</h3>
                <p className="text-sm text-amber-800">{result.calendar.busyNote}</p>
                <p className="text-xs text-amber-600 mt-1">Saved calendar commitments were considered when fitting this session.</p>
              </div>
            )}

            {fuel && (
              <div className="card">
                <h3 className="font-display font-bold mb-2 flex items-center gap-2"><Flame className="w-4 h-4 text-orange-500" /> {t(lang, "common.today")}</h3>
                <div className="text-sm text-slate-600 space-y-1">
                  <div>{t(lang, "fuel.carbs")}: <strong>{fuel.carbsPerHourG} g/h</strong></div>
                  <div>{t(lang, "fuel.sodium")}: <strong>{fuel.sodiumMgPerHour} mg/h</strong> · {t(lang, "fuel.fluid")}: <strong>{fuel.fluidMlPerHour} ml/h</strong></div>
                  {fuel.caffeineMg && <div>{t(lang, "fuel.caffeine")}: <strong>{fuel.caffeineMg} mg</strong> pre-session</div>}
                </div>
              </div>
            )}

            {ergos && (
              <div className="card">
                <h3 className="font-display font-bold mb-1 flex items-center gap-2"><Pill className="w-4 h-4 text-ocean-500" /> {t(lang, "fuel.ergos")}</h3>
                <p className="text-xs text-slate-400 mb-2">Optional pre-workout aids — graded A/B by the strength of the human evidence. Skip anything you don&apos;t like.</p>
                {ergos.length === 0 ? (
                  <p className="text-sm text-slate-500">No aids match today&apos;s session.</p>
                ) : (
                  <div className="space-y-2">
                    {ergos.map((e: any) => (
                      <div key={e.key} className="text-sm">
                        <div><strong>{t(lang, `ergo.${e.key}`)}</strong> <span className="chip chip-z2">{e.evidence}</span></div>
                        <div className="text-xs text-slate-500">{e.dose} · {e.when}</div>
                        <div className="text-xs text-slate-400">{e.benefit}{e.caution ? ` ⚠ ${e.caution}` : ""}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {result?.post && (
              <div className="card">
                <h3 className="font-display font-bold mb-2 flex items-center gap-2"><Apple className="w-4 h-4 text-emerald-500" /> Post-workout refuel</h3>
                <div className="text-sm text-slate-600 space-y-1">
                  <div><strong>{result.post.carbsG ?? "—"}g carbs : {result.post.proteinG ?? "—"}g protein</strong> ({result.post.ratio})</div>
                  <div className="text-xs text-slate-500">{result.post.window}</div>
                  <div className="text-xs text-slate-500">{result.post.sodiumMg ?? "—"}mg sodium · {result.post.fluidMl ?? "—"}ml fluid</div>
                  <div className="text-xs text-slate-500">{result.post.examples}</div>
                  <div className="text-xs text-slate-400 mt-1">{result.post.notes}</div>
                </div>
              </div>
            )}

            {result?.stim && (
              <div className="card">
                <h3 className="font-display font-bold mb-2 flex items-center gap-2"><Music className="w-4 h-4 text-ocean-500" /> Stimulation — music, brain & breath</h3>
                <div className="space-y-2 text-sm">
                  <div><span className="font-semibold">Pre:</span> <a href={result.stim.pre.music.url} target="_blank" rel="noreferrer" className="text-ocean-600 underline">{result.stim.pre.music.title}</a>
                    <div className="text-xs text-slate-500">{result.stim.pre.brain}</div>
                    <div className="text-xs text-slate-400">{result.stim.pre.breath}</div>
                  </div>
                  {result.stim.during && (
                    <div><span className="font-semibold">During:</span> <a href={result.stim.during.music.url} target="_blank" rel="noreferrer" className="text-ocean-600 underline">{result.stim.during.music.title}</a>
                      <div className="text-xs text-slate-500">{result.stim.during.brain}</div>
                    </div>
                  )}
                  <div><span className="font-semibold">Post:</span> <a href={result.stim.post.music.url} target="_blank" rel="noreferrer" className="text-ocean-600 underline">{result.stim.post.music.title}</a>
                    <div className="text-xs text-slate-500">{result.stim.post.brain}</div>
                    <div className="text-xs text-slate-400">{result.stim.post.breath}</div>
                  </div>
                  <div><span className="font-semibold">Night:</span> <a href={result.stim.night.music.url} target="_blank" rel="noreferrer" className="text-ocean-600 underline">{result.stim.night.music.title}</a>
                    <div className="text-xs text-slate-500">{result.stim.night.brain}</div>
                  </div>
                  <p className="text-[11px] text-slate-400 mt-1">{result.stim.post.why}</p>
                </div>
              </div>
            )}

            {recovery && (
              <div className="card">
                <h3 className="font-display font-bold mb-2 flex items-center gap-2"><Wind className="w-4 h-4 text-emerald-500" /> {t(lang, "common.recovery")}</h3>
                <div className="font-semibold text-sm">{recovery.name} · {recovery.minutes} min</div>
                <p className="text-xs text-slate-500 mt-1">{recovery.instructions}</p>
              </div>
            )}

            {result?.hydration && (
              <div className="card">
                <h3 className="font-display font-bold mb-2 flex items-center gap-2"><HeartPulse className="w-4 h-4 text-ocean-500" /> Biometrics & Recovery</h3>
                {result.hydration.rhrNote && <p className="text-xs text-slate-600 mb-1">❤️ {result.hydration.rhrNote}</p>}
                {result.hydration.hrvNote && <p className="text-xs text-slate-600 mb-1">📈 {result.hydration.hrvNote}</p>}
                {result.hydration.sleepNote && <p className="text-xs text-slate-600 mb-1">😴 {result.hydration.sleepNote}</p>}
                {result.hydration.weightTrend && (
                  <p className={`text-xs leading-relaxed rounded-lg px-2 py-1.5 ${result.hydration.weightTrend.flag === "ok" ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>
                    ⚖️ {result.hydration.weightTrend.advice}
                  </p>
                )}
                {!result.hydration.weightTrend && !result.hydration.rhrNote && !result.hydration.hrvNote && !result.hydration.sleepNote && <p className="text-xs text-slate-400">Add morning weight, RHR, HRV + sleep hours above — trends kick in after a few days.</p>}
              </div>
            )}

            {fuelBrands && (
              <div className="card">
                <h3 className="font-display font-bold mb-2 flex items-center gap-2"><ShoppingCart className="w-4 h-4 text-ocean-500" /> {t(lang, "fuel.brands")}</h3>
                <p className="text-xs text-slate-400 mb-2">{fuelBrands.note}</p>
                <div className="space-y-1.5">
                  {fuelBrands.brands.map((b: any) => (
                    <div key={b.name} className="flex items-center justify-between text-sm">
                      <span className="font-medium">{b.name} <span className="text-[10px] uppercase text-slate-400">({b.type})</span></span>
                      <span className="text-xs text-slate-500">{b.carbsG} carb · {b.sodiumMg} Na</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {sources && sources.length > 0 && (
              <div className="card bg-slate-50 border-slate-200">
                <h3 className="font-display font-bold text-sm mb-2 flex items-center gap-2"><BookOpen className="w-4 h-4 text-slate-500" /> Evidence (human studies)</h3>
                <ul className="text-[11px] text-slate-500 space-y-1">
                  {sources.slice(0, 5).map((s: any) => (
                    <li key={s.id}>• {s.ref} — <em>{s.population}</em></li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      </div>
    </ProtectedPage>
  );
}
