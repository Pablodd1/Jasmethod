"use client";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { ProtectedPage } from "@/components/gate";
import { useAuth } from "@/components/auth";
import type { ReplyCandidate, MissingQuestion } from "@/lib/coaching-communication";

type Preferences = { primaryChannel: string; paused: boolean; dailyPlan: boolean; sessionFeedback: boolean; missingData: boolean;
  timezone: string; minuteOfDay: number; quietStart: number; quietEnd: number; declinedOptional: string[]; consentVersion?: string | null;
  verifiedChatId?: string | null; verifiedActorId?: string | null; verifiedEmail?: string | null; verificationTransport?: string | null };
type Prompt = { transport: string; id: string; sessionId: string; purpose: string; observationDate: string; timezone: string; sourceRevision: string;
  status: string; replyStatus: string; error?: string | null; attempts: number; nextAttemptAt?: string | null; message: string;
  candidate: ReplyCandidate | null; questions: MissingQuestion[] };
const blank: Preferences = { primaryChannel: "app", paused: true, dailyPlan: false, sessionFeedback: false, missingData: false,
  timezone: "UTC", minuteOfDay: 1020, quietStart: 1260, quietEnd: 420, declinedOptional: [] };
const clockText = (minute: number) => `${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`;
const clockNumber = (value: string) => { const [h, m] = value.split(":").map(Number); return h * 60 + m; };
async function api(path: string, method = "GET", body?: unknown, signal?: AbortSignal) {
  const response = await fetch(path, { method, signal, ...(body ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : {}) });
  const data = await response.json(); if (!response.ok) throw new Error(data.error || "Request failed"); return data;
}
function ReplyEditor({ prompt, es, disabled, onSubmit }: { prompt: Prompt; es: boolean; disabled: boolean; onSubmit: (prompt: Prompt, action: string, candidate?: ReplyCandidate) => void }) {
  const [answer, setAnswer] = useState<ReplyCandidate>(prompt.candidate!);
  const label = (en: string, spanish: string) => es ? spanish : en;
  return <section className="space-y-3 border-t pt-3" aria-label={label("Review answer", "Revisar respuesta")}>
    <p className="font-semibold">{label("Review and edit before saving", "Revisa y edita antes de guardar")}</p>
    <p>{label("Observation date", "Fecha observada")}: {prompt.observationDate} ({prompt.timezone}). {label("No training data changed yet.", "Todavía no se cambió ningún dato de entrenamiento.")}</p>
    <label className="block">{label("Outcome", "Resultado")}<select className="input" value={answer.status} onChange={e => setAnswer({ ...answer, status: e.target.value as ReplyCandidate["status"], ...(e.target.value === "skipped" ? { minutes: null, rpe: null, sport: null } : {}) })}>
      {[["completed", "Completed", "Completado"], ["partial", "Partial", "Parcial"], ["substituted", "Substituted", "Sustituido"], ["skipped", "Skipped", "Omitido"], ["unknown", "Unknown", "Desconocido"]].map(([value,en,sp]) => <option key={value} value={value}>{label(en,sp)}</option>)}
    </select></label>
    <div className="grid sm:grid-cols-2 gap-3">
      <label>{label("Actual minutes (blank = unknown)", "Minutos reales (vacío = desconocido)")}<input className="input" type="number" min={0} max={1440} value={answer.minutes ?? ""} onChange={e => setAnswer({ ...answer, minutes: e.target.value === "" ? null : Number(e.target.value) })}/></label>
      <label>{label("Session RPE (blank = unknown)", "RPE de la sesión (vacío = desconocido)")}<input className="input" type="number" min={1} max={10} value={answer.rpe ?? ""} onChange={e => setAnswer({ ...answer, rpe: e.target.value === "" ? null : Number(e.target.value) })}/></label>
    </div>
    <p className="text-sm">1 {label("very easy", "muy fácil")}, 3 {label("easy", "fácil")}, 5 {label("moderate", "moderado")}, 7 {label("hard", "duro")}, 9 {label("very hard", "muy duro")}, 10 {label("maximal", "máximo")}.</p>
    <label className="block">{label("Actual sport", "Deporte real")}<select className="input" value={answer.sport ?? ""} onChange={e => setAnswer({ ...answer, sport: e.target.value || null })}>
      <option value="">{label("Unknown", "Desconocido")}</option>{["run", "bike", "swim", "strength", "mobility", "recovery", "brick", "hyrox", "other"].map(s => <option key={s}>{s}</option>)}
    </select></label>
    {prompt.questions.filter(q => q.optional).map(q => <label key={q.key} className="flex gap-2"><input type="checkbox" checked={answer.declinedOptional.includes(q.key)} onChange={e => setAnswer({ ...answer, declinedOptional: e.target.checked ? [...answer.declinedOptional, q.key] : answer.declinedOptional.filter(k => k !== q.key) })}/>{label("Do not ask again for optional", "No volver a pedir este dato opcional")}: {q.key}</label>)}
    <p className="text-sm">{label("Symptoms and safety answers stay in the private check-in. Confirmed actuals require a new check-in before further training.", "Los síntomas y las respuestas de seguridad se registran en el chequeo privado. Después de confirmar, actualiza el chequeo antes de seguir entrenando.")}</p>
    <div className="flex gap-3"><button className="btn-primary" disabled={disabled} onClick={() => onSubmit(prompt, "confirm", answer)}>{label("Confirm these actuals", "Confirmar datos reales")}</button><button className="btn-secondary" disabled={disabled} onClick={() => onSubmit(prompt, "dismiss")}>{label("Dismiss", "Descartar")}</button></div>
  </section>;
}
export default function RemindersPage() {
  const { user } = useAuth(); const es = user?.language === "es";
  const label = (en: string, spanish: string) => es ? spanish : en;
  const [prefs, setPrefs] = useState<Preferences>(blank), [enabled, setEnabled] = useState(false), [prompts, setPrompts] = useState<Prompt[]>([]);
  const [transport, setTransport] = useState("mock"), [consentVersion, setConsentVersion] = useState("mock-coaching-v1"), [pairingUrl, setPairingUrl] = useState<string | null>(null);
  const [workouts, setWorkouts] = useState<Array<{ id: string; title: string; date: string }>>([]);
  const [error, setError] = useState(""), [notice, setNotice] = useState(""), [busy, setBusy] = useState(false), [loaded, setLoaded] = useState(false);
  const [sessionId, setSessionId] = useState(""), [purpose, setPurpose] = useState("sessionFeedback"), [syntheticId, setSyntheticId] = useState("");
  const [outgoing, setOutgoing] = useState<{ prompt: Prompt; replyToken: string | null } | null>(null), [reply, setReply] = useState("");
  const load = useCallback(async (signal?: AbortSignal) => {
    const [p, q, w] = await Promise.all([api("/api/coaching/preferences", "GET", undefined, signal), api("/api/coaching/prompts", "GET", undefined, signal), api("/api/workouts?days=14", "GET", undefined, signal)]);
    setPrefs(p.preferences); setEnabled(p.enabled); setTransport(p.transport); setConsentVersion(p.consentVersion); setPrompts(q.prompts); setWorkouts(w.workouts); setLoaded(true);
  }, []);
  useEffect(() => { if (!user) return; const controller = new AbortController(); load(controller.signal).catch(e => { if (!controller.signal.aborted) setError(e.message); }); return () => controller.abort(); }, [user, load]);
  async function action(work: () => Promise<void>) { setBusy(true); setError(""); setNotice(""); try { await work(); } catch (e) { setError((e as Error).message); } finally { setBusy(false); } }
  async function save(pause = prefs.paused) {
    const { primaryChannel, dailyPlan, sessionFeedback, missingData, timezone, minuteOfDay, quietStart, quietEnd, declinedOptional } = prefs;
    await api("/api/coaching/preferences", "PUT", { primaryChannel, paused: pause, dailyPlan, sessionFeedback, missingData, timezone, minuteOfDay, quietStart, quietEnd, declinedOptional, consentVersion });
    setOutgoing(null); await load(); setNotice(transport === "telegram" ? label("Preferences saved for verified Telegram. Pause stops future attempts.", "Preferencias guardadas para Telegram verificado. Pausar detiene futuros intentos.") : label("Preferences saved. No external delivery is enabled.", "Preferencias guardadas. No se activó ningún envío externo."));
  }
  async function pair() {
    const challenge = await api("/api/coaching/pairing", "POST");
    if (challenge.transport === "telegram") { setPairingUrl(challenge.pairingUrl); setNotice(label("Open your Telegram bot with this short-lived link, send the pairing message, then refresh. Linking does not opt you in.", "Abre el bot con este enlace temporal, envía el mensaje y actualiza. Vincular no activa ningún fin.")); return; }
    await api("/api/coaching/pairing", "PUT", prefs.primaryChannel === "telegram" ? { token: challenge.token, channel: "telegram", actorId: syntheticId, chatId: syntheticId, chatType: "private" } : { token: challenge.token, channel: "email", email: user?.email });
    await load(); setNotice(label("Synthetic binding verified. No real account was contacted. Choose purposes and save to opt in.", "Vínculo de prueba verificado. No se contactó ninguna cuenta real. Elige los fines y guarda para aceptar."));
  }
  async function submitReply() {
    if (!outgoing?.replyToken || !user) return;
    const p = outgoing.prompt;
    await api("/api/coaching/replies", "POST", { promptId: p.id, sessionId: p.sessionId, observationDate: p.observationDate, timezone: p.timezone,
      sourceRevision: p.sourceRevision, token: outgoing.replyToken, text: reply,
      actorId: prefs.primaryChannel === "telegram" ? prefs.verifiedActorId : user.id,
      chatId: prefs.primaryChannel === "telegram" ? prefs.verifiedChatId : prefs.primaryChannel === "email" ? prefs.verifiedEmail : user.id });
    setOutgoing(null); setReply(""); await load(); setNotice(label("Answer parsed. Review and confirm below; nothing has affected training yet.", "Respuesta interpretada. Revisa y confirma abajo; aún no afecta al entrenamiento."));
  }
  async function confirm(prompt: Prompt, type: string, candidate?: ReplyCandidate) {
    const result = await api("/api/coaching/replies", "PUT", { promptId: prompt.id, action: type, expectedRevision: prompt.sourceRevision, candidate });
    await load(); setNotice(result.applied ? label("Confirmed. Update today's check-in to reassess training.", "Confirmado. Actualiza el chequeo de hoy para reevaluar el entrenamiento.") : label("Draft dismissed.", "Borrador descartado."));
  }
  return <ProtectedPage><div className="space-y-6 max-w-3xl">
    <h1 className="font-display text-2xl font-bold">{label("Coaching communications", "Comunicaciones de entrenamiento")}</h1>
    <p><Link className="underline" href="/workout-email/settings">{label("Manual Garmin email preferences (separate opt-in)", "Preferencias de correo Garmin manual (consentimiento separado)")}</Link></p>
    <p className="rounded-xl border border-amber-300 bg-amber-50 p-4">{transport === "telegram" && enabled ? label("Telegram delivery is enabled only for your verified private chat and selected purposes. Provider acceptance does not establish reading. Email and other delivery channels remain disabled.", "Telegram solo está activo para tu chat privado verificado y los fines elegidos. La aceptación del proveedor no prueba lectura. El correo y los otros canales están desactivados.") : label("External delivery is disabled pending provider and privacy review. The isolated test mode below simulates acceptance only; it never sends Telegram or email, or claims a read receipt.", "El envío externo está desactivado hasta revisar proveedores y privacidad. El modo de prueba solo simula aceptación; no envía Telegram ni correo ni confirma lectura.")}</p>
    {error && <p role="alert" className="text-red-700">{error}</p>}{notice && <p role="status" className="text-emerald-800">{notice}</p>}
    {!loaded ? <p role="status">{label("Loading preferences…", "Cargando preferencias…")}</p> : <>
    <section className="card space-y-4"><h2 className="font-bold text-lg">{label("Your choices", "Tus preferencias")}</h2>
      <label className="block">{label("One primary channel", "Un canal principal")}<select className="input" value={prefs.primaryChannel} onChange={e => setPrefs({ ...prefs, primaryChannel: e.target.value, paused: true })}>
        <option value="app">{label("App", "Aplicación")}</option><option value="telegram">Telegram ({transport === "telegram" ? label("verified chat", "chat verificado") : label("available, disabled / mock only", "disponible, desactivado / solo prueba")})</option><option value="email">{label("Email (mock only)", "Correo (solo prueba)")}</option>
      </select></label>
      {([ ["dailyPlan", "Selected-session guidance", "Guía de la sesión seleccionada"], ["sessionFeedback", "Session outcome / actual minutes / RPE questions", "Preguntas de resultado, minutos reales y RPE"], ["missingData", "Missing-input questions with their decision consequences", "Preguntas de datos que faltan y sus consecuencias"] ] as const).map(([key,en,sp]) => <label key={key} className="flex gap-3 items-start"><input type="checkbox" checked={prefs[key]} onChange={e => setPrefs({ ...prefs, [key]: e.target.checked })}/>{label(en,sp)}</label>)}
      <p className="text-sm">{label("Each purpose is optional and off until you choose it. One channel, at most three prompts per local day. Symptoms, history and body measurements stay in the app. Unconfirmed answers expire after seven days and are cleared on the next app visit or scheduler run; raw audio and incoming text are not stored by this flow. Confirmed edits preserve an audit history.", "Cada fin es opcional y está desactivado hasta que lo elijas. Un canal, máximo tres avisos por día local. Síntomas, historial y medidas corporales quedan en la aplicación. Las respuestas sin confirmar vencen en siete días y se borran en la próxima visita o ejecución programada. Este flujo no guarda audio ni el texto recibido. Las ediciones confirmadas conservan historial de auditoría.")}</p>
      <label className="flex gap-3"><input type="checkbox" checked={prefs.paused} onChange={e => setPrefs({ ...prefs, paused: e.target.checked })}/>{label("Pause all purposes", "Pausar todos los fines")}</label>
      <label className="block">{label("Schedule timezone (IANA)", "Zona horaria (IANA)")}<input className="input" value={prefs.timezone} onChange={e => setPrefs({ ...prefs, timezone: e.target.value })}/></label>
      <div className="grid sm:grid-cols-3 gap-3">{([ ["minuteOfDay", "Daily time", "Hora diaria"], ["quietStart", "Quiet hours start", "Inicio de silencio"], ["quietEnd", "Quiet hours end", "Fin de silencio"] ] as const).map(([key,en,sp]) => <label key={key}>{label(en,sp)}<input className="input" type="time" value={clockText(prefs[key])} onChange={e => setPrefs({ ...prefs, [key]: clockNumber(e.target.value) })}/></label>)}</div>
      <p className="text-sm">{label("Quiet hours postpone the attempt. A daylight-saving repeated hour is used once; a skipped time moves to the next available local minute.", "El horario de silencio pospone el intento. Una hora repetida se usa una vez; una hora inexistente pasa al próximo minuto local disponible.")}</p>
      {prefs.declinedOptional.length > 0 && <div><p>{label("Optional inputs you declined", "Datos opcionales rechazados")}: {prefs.declinedOptional.join(", ")}</p><button className="btn-secondary" disabled={busy} onClick={() => setPrefs({ ...prefs, declinedOptional: [] })}>{label("Allow those questions again (save required)", "Permitir esas preguntas (debes guardar)")}</button></div>}
      <div className="flex flex-wrap gap-3"><button className="btn-secondary" disabled={busy} onClick={() => action(async () => { await api("/api/coaching/pairing", "DELETE"); setOutgoing(null); setPairingUrl(null); await load(); setNotice(label("Disconnected. Outstanding linking challenges and answers are revoked.", "Desconectado. Se revocaron los enlaces y respuestas pendientes.")); })}>{label("Disconnect and revoke", "Desconectar y revocar")}</button><button className="btn-primary" disabled={busy} onClick={() => action(() => save())}>{label("Save these choices", "Guardar preferencias")}</button><button className="btn-secondary" disabled={busy} onClick={() => action(() => save(true))}>{label("Pause / unsubscribe", "Pausar / cancelar suscripción")}</button></div>
    </section>
    {enabled && <section className="card space-y-4"><h2 className="font-bold text-lg">{transport === "telegram" ? label("Telegram linking and selected-session delivery", "Vinculación y envío de sesión por Telegram") : label("Isolated mock test", "Prueba aislada")}</h2>
      {prefs.primaryChannel !== "app" && <div className="space-y-2"><p>{label("Verification status", "Verificación")}: {prefs.verificationTransport === "telegram" ? label("private chat verified", "chat privado verificado") : prefs.verificationTransport === "mock" ? label("synthetic only", "solo sintética") : label("unverified", "sin verificar")}</p>
        {transport === "mock" && prefs.primaryChannel === "telegram" && <label className="block">{label("Synthetic private chat / sender ID (digits)", "ID de chat privado y remitente de prueba (dígitos)")}<input className="input" inputMode="numeric" value={syntheticId} onChange={e => setSyntheticId(e.target.value)}/></label>}
        <button className="btn-secondary" disabled={busy || (transport === "mock" && prefs.primaryChannel === "telegram" && !syntheticId)} onClick={() => action(pair)}>{transport === "telegram" ? label("Link my private Telegram chat", "Vincular mi chat privado") : label("Verify synthetic binding", "Verificar vínculo de prueba")}</button>
        {pairingUrl && <a className="underline" href={pairingUrl} target="_blank" rel="noopener noreferrer">{label("Open pairing link in Telegram", "Abrir enlace en Telegram")}</a>}
        {transport === "telegram" && <button className="btn-secondary" disabled={busy} onClick={() => action(() => load())}>{label("Refresh verification", "Actualizar verificación")}</button>}
      </div>}
      <label className="block">{label("Select the exact session", "Selecciona la sesión exacta")}<select className="input" value={sessionId} onChange={e => { setSessionId(e.target.value); setOutgoing(null); }}><option value="">{label("Choose a session", "Elige una sesión")}</option>{workouts.map(w => <option key={w.id} value={w.id}>{w.date.slice(0,10)} · {w.title}</option>)}</select></label>
      <label className="block">{label("Purpose", "Fin")}<select className="input" value={purpose} onChange={e => setPurpose(e.target.value)}><option value="sessionFeedback">{label("Session feedback", "Respuesta de sesión")}</option><option value="missingData">{label("Missing inputs", "Datos que faltan")}</option><option value="dailyPlan">{label("Session guidance", "Guía de sesión")}</option></select></label>
      <button className="btn-secondary" disabled={busy || !sessionId} onClick={() => action(async () => { const result = await api("/api/coaching/prompts", "POST", { sessionId, purpose }); setOutgoing(result); setReply(""); await load(); setNotice(result.duplicate ? label("Existing prompt reused; no duplicate attempt.", "Aviso existente; no se repitió el intento.") : (transport === "telegram" ? `${label("Delivery result", "Resultado del envío")}: ${result.prompt.status}` : label("Mock acceptance recorded. No external message sent.", "Aceptación de prueba registrada. Sin envío externo."))); })}>{transport === "telegram" ? label("Send selected prompt", "Enviar aviso seleccionado") : label("Simulate selected prompt", "Simular aviso seleccionado")}</button>
      {outgoing?.replyToken && <div className="space-y-3"><p>{label("The one-time test reply expires after 30 minutes. Use labeled English field names; other languages and free text use the app form.", "La respuesta de prueba vence en 30 minutos. Usa campos en inglés; para otros idiomas y texto libre, usa el formulario de la aplicación.")}</p><label className="block">{label("Mock answer", "Respuesta de prueba")}<textarea className="input" value={reply} onChange={e => setReply(e.target.value)} placeholder="status=completed; minutes=30; rpe=5; sport=run"/></label><button className="btn-secondary" disabled={busy || !reply.trim()} onClick={() => action(submitReply)}>{label("Parse into editable draft", "Crear borrador editable")}</button></div>}
    </section>}
    <section className="space-y-3"><h2 className="font-bold text-lg">{label("Prompts and answers", "Avisos y respuestas")}</h2>
      {!prompts.length && <p>{label("No attempts or answers yet.", "Todavía no hay intentos ni respuestas.")}</p>}
      {prompts.map(p => <article className="card space-y-3" key={p.id}><h3 className="font-semibold">{p.purpose} · {p.observationDate}</h3><p>{label("Delivery", "Entrega")}: {p.status} ({p.transport === "mock" ? label("mock only", "solo prueba") : "Telegram"}) · {label("Answer", "Respuesta")}: {p.replyStatus} · {label("Attempts", "Intentos")}: {p.attempts}</p>
        {p.error && <p className="text-amber-800">{p.error}</p>}{p.nextAttemptAt && <p>{label("Retry no earlier than", "Reintentar después de")}: {new Date(p.nextAttemptAt).toLocaleString()}</p>}
        <details><summary className="cursor-pointer">{label("Message and exact missing inputs", "Mensaje y datos concretos que faltan")}</summary><p className="whitespace-pre-wrap text-sm">{p.message}</p><ul className="list-disc pl-5">{p.questions.map(q => <li key={q.key}>{q.question} {q.consequence} {q.optional ? label("Optional", "Opcional") : ""}</li>)}</ul></details>
        {p.questions.filter(q => q.optional && !prefs.declinedOptional.includes(q.key)).map(q => <button key={q.key} className="btn-secondary" disabled={busy} onClick={() => action(async () => {
          const { primaryChannel, paused, dailyPlan, sessionFeedback, missingData, timezone, minuteOfDay, quietStart, quietEnd } = prefs;
          await api("/api/coaching/preferences", "PUT", { primaryChannel, paused, dailyPlan, sessionFeedback, missingData, timezone, minuteOfDay, quietStart, quietEnd, declinedOptional: [...prefs.declinedOptional, q.key], consentVersion });
          setOutgoing(null); await load();
        })}>{label("Don't ask again for optional", "No volver a pedir este dato opcional")}: {q.key}</button>)}
        <a className="underline" href={`/daily?sessionId=${encodeURIComponent(p.sessionId)}`}>{label("Open this session", "Abrir esta sesión")}</a>
        {p.replyStatus === "pending" && ["simulated", "sent"].includes(p.status) && p.candidate && <ReplyEditor prompt={p} es={es} disabled={busy} onSubmit={(p,a,c) => action(() => confirm(p,a,c))}/>}
      </article>)}
    </section><a className="underline" href="/checkin">{label("Open private check-in", "Abrir chequeo privado")}</a>
    </>}
  </div></ProtectedPage>;
}
