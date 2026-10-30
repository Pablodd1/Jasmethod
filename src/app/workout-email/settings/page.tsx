"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";

type Preference = { enabled: boolean; daily: boolean; revisions: boolean; calendarGuidance: boolean; timezone: string; minuteOfDay: number; leadMinutes: number; verified: boolean };
export default function ManualWorkoutEmailSettings() {
  const [state, setState] = useState<{ configured: boolean; language?: string; languageSupported?: boolean; email?: string; consentVersion?: string; preference?: Preference } | null>(null);
  const t = (en: string, es: string) => state?.language === "es" ? es : en;
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [code, setCode] = useState("");
  const [consent, setConsent] = useState(false);
  const pending = useRef(false);
  const [failed,setFailed] = useState(false);
  async function load(signal?: AbortSignal) {
    const response = await fetch("/api/workout-email/preferences", { cache: "no-store", signal });
    if (!response.ok) throw Error(response.status === 401 ? "Sign in to manage your workout emails." : "Preferences could not be loaded.");
    setState(await response.json());
  }
  useEffect(() => { const controller = new AbortController(); load(controller.signal).catch(e => { if (e.name !== "AbortError") setMessage(e.message); }); return () => controller.abort(); }, []);
  async function request(path: string, body: unknown, method = "POST") {
    if (pending.current) return;
    pending.current=true;
    setBusy(true); setMessage(""); setFailed(false);
    try {
      const response = await fetch(`/api/workout-email/${path}`, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const result = await response.json();
      if (!response.ok) throw Error(result.error || result.message || "Request could not be confirmed.");
      const action = (body as {action?:string}).action;
      if ((path === "verify" && (action === "request" ? result.status !== "accepted" : result.verified !== true)) || (path === "preferences" && result.ok !== true)) throw Error(t("The result could not be verified. Reload before retrying.", "No se pudo verificar el resultado. Recarga antes de volver a intentarlo."));
      setMessage(result.message || (path === "verify" ? action === "request" ? t("The mail server accepted your verification email. Check your inbox; it is not verified yet.", "El servidor aceptó el correo de verificación. Revisa tu bandeja; todavía no está verificada.") : t("Email verified. Review the choices below before enabling.", "Correo verificado. Revisa las opciones antes de activar.") : t("Preferences saved.", "Preferencias guardadas.")));
      setCode("");
      await load();
    } catch (e) { setFailed(true); setMessage((e as Error).message); }
    finally { pending.current=false; setBusy(false); }
  }
  const pref = state?.preference;
  function change(update: Partial<Preference>) { setState(s => s?.preference ? { ...s, preference: { ...s.preference, ...update } } : s); }
  return <main className="mx-auto max-w-2xl p-6 space-y-5 [&_button]:min-h-11 [&_input:not([type=checkbox])]:min-h-11">
    <h1 className="text-2xl font-bold">{t("Manual Garmin workout emails", "Correos para entrenamientos Garmin manuales")}</h1>
    <p>{t("Get a saved-plan preview and private check-in link when today's review is pending. An approved current workout can include its FIT file and preparation steps. You transfer the file with a computer and a compatible Garmin USB connection. Email acceptance never confirms delivery to your watch.", "Recibe una vista previa del plan guardado y el enlace al check-in privado cuando falte la revisión del día. El entrenamiento actual aprobado puede incluir su FIT y los pasos de preparación. Lo transfieres con un ordenador y una conexión USB Garmin compatible. La aceptación del correo nunca confirma la entrega al reloj.")}</p>
    <p><Link className="underline" href="/daily">{t("Open current training", "Abrir el entrenamiento actual")}</Link> · <Link className="underline" href="/login">{t("Sign in", "Iniciar sesión")}</Link></p>
    {message && <p role={failed?"alert":"status"} className="rounded border p-3">{message}</p>}
    <details className="rounded border p-3"><summary className="cursor-pointer min-h-11">{t("What these emails include", "Qué incluyen estos correos")}</summary><p>{t("These settings cover saved-plan previews, approved workout instructions and update notices. Saved coach conversations remain in Coach; this page does not email chat transcripts or motivation digests. Verifying your inbox does not enable a schedule.", "Estos ajustes cubren vistas previas del plan, instrucciones de entrenamientos aprobados y avisos de cambios. Las conversaciones guardadas siguen en Coach; esta página no envía transcripciones ni resúmenes de motivación. Verificar tu correo no activa un horario.")}</p><Link className="underline min-h-11 inline-flex items-center" href="/coach">{t("Open my coach conversations", "Abrir mis conversaciones con el coach")}</Link></details>
    {!state && !message && <p role="status">{t("Loading preferences…", "Cargando preferencias…")}</p>}
    {state && !state.configured && <p>{t("Manual workout email is not enabled for this installation. You can still review and download your current workout in the app.", "El correo de entrenamientos manuales no está activo en esta instalación. Puedes consultar y descargar el entrenamiento actual en la aplicación.")}</p>}
    {state?.languageSupported === false && <p role="status">{{ fr: "Les emails d’entraînement ne sont pas encore disponibles en français. Aucun email ne sera envoyé automatiquement dans une autre langue.", ht: "Imèl antrènman yo poko disponib an kreyòl. Nou p ap voye yo otomatikman nan yon lòt lang.", ru: "Письма с тренировками пока недоступны на русском. Письма не будут автоматически отправляться на другом языке." }[state.language as "fr" | "ht" | "ru"] || "Workout email is unavailable in your saved language. No silent fallback email will be sent."}</p>}
    {pref && <>
      <section className="space-y-3"><h2 className="text-lg font-semibold">{t("1. Verify your own inbox", "1. Verifica tu propia bandeja de entrada")}</h2>
        <p>{state.email} · {pref.verified ? t("Verified", "Verificado") : t("Not verified", "Sin verificar")}</p>
        <button disabled={busy || !state.configured || !state.languageSupported} className="rounded border p-2 disabled:opacity-50" onClick={() => request("verify", { action: "request", sendCodeToAccountEmail: true })}>{t("Email me a verification code", "Envíame un código de verificación")}</button>
        <label className="block">{t("Verification code ", "Código de verificación ")}<input className="block rounded border p-2" autoComplete="one-time-code" maxLength={12} value={code} onChange={e => setCode(e.target.value)} /></label>
        <button disabled={busy || code.trim().length !== 12} className="rounded border p-2 disabled:opacity-50" onClick={() => request("verify", { action: "confirm", code })}>{t("Verify code", "Verificar código")}</button>
      </section>
      <section className="space-y-3"><h2 className="text-lg font-semibold">{t("2. Choose what to receive", "2. Elige qué recibir")}</h2>
        <label className="block"><input type="checkbox" checked={pref.daily} onChange={e => change({ daily: e.target.checked })} /> {t("Daily approved workout or a reminder to review the plan", "Entrenamiento aprobado del día o recordatorio para revisar el plan")}</label>
        <label className="block"><input type="checkbox" checked={pref.revisions} onChange={e => change({ revisions: e.target.checked })} /> {t("Updates and cancellation/hold notices for files already emailed", "Actualizaciones y avisos de cancelación o pausa de archivos ya enviados")}</label>
        <label className="block"><input type="checkbox" checked={pref.calendarGuidance} onChange={e => change({ calendarGuidance: e.target.checked })} /> {t("Also include workout instructions, targets and nutrition guidance in my connected Google Calendar. I understand anyone with access to that calendar may see these details. Otherwise calendar entries show only a minimal session placeholder (access follows existing calendar sharing) and app link.", "Incluir también instrucciones, objetivos y nutrición en mi Google Calendar conectado. Entiendo que cualquier persona con acceso a ese calendario podría ver esos datos. Si no, las entradas solo mostrarán un marcador mínimo y el enlace a la aplicación; el acceso depende de cómo comparta mi calendario.")}</label>
        <label className="block">{t("Local send time", "Hora local de envío")} ({pref.timezone}) <input className="block rounded border p-2" type="time" value={`${String(Math.floor(pref.minuteOfDay / 60)).padStart(2, "0")}:${String(pref.minuteOfDay % 60).padStart(2, "0")}`} onChange={e => { const [h,m] = e.target.value.split(":").map(Number); change({ minuteOfDay: h * 60 + m }); }} /></label>
        <button disabled={busy} className="rounded border p-2" onClick={() => change({ minuteOfDay: 300 })}>{t("Use 5 a.m. in my profile timezone (save required)", "Usar las 5 a. m. en la zona del perfil (debes guardar)")}</button>
        <label className="block">{t("Minutes before a scheduled start ", "Minutos antes del inicio previsto ")}<input className="block rounded border p-2" type="number" min={30} max={720} value={pref.leadMinutes} onChange={e => change({ leadMinutes: Number(e.target.value) })} /></label>
        <p className="text-sm">{t("The earlier send time is used. Processing runs about every 5 minutes. Approval and the session-day check-in are required for a FIT attachment. Without a start time, arrival before training cannot be guaranteed. Changes need a new approval; old attachments and on-device workouts cannot be recalled.", "Se usa la hora de envío más temprana. El proceso se ejecuta aproximadamente cada 5 minutos. Adjuntar el FIT requiere aprobación y el chequeo del día. Sin hora de inicio no se puede garantizar la llegada antes de entrenar. Los cambios requieren nueva aprobación; no se pueden retirar adjuntos antiguos ni entrenamientos ya transferidos.")}</p>
        <label className="block"><input type="checkbox" checked={consent} onChange={e => setConsent(e.target.checked)} /> {t("I agree to send my workout schedule, instructions, targets, zone graphic, FIT file and nutrition guidance to my verified inbox using this app’s email provider for the selected purposes. Inbox access may expose this information.", "Acepto enviar el horario, las instrucciones, los objetivos, el gráfico de zonas, el FIT y la nutrición a mi bandeja verificada mediante el proveedor de correo de esta aplicación para los fines seleccionados. Quien acceda a la bandeja podría ver estos datos.")}</label>
        <label className="block"><input type="checkbox" checked={pref.enabled} onChange={e => change({ enabled: e.target.checked })} /> {t("Enable these emails", "Activar estos correos")}</label>
        <button disabled={busy || (pref.enabled && (!pref.verified || !consent || !state.languageSupported))} className="rounded border p-2 disabled:opacity-50" onClick={() => { const { verified, ...settings } = pref; void verified; request("preferences", { ...settings, consentVersion: state.consentVersion }, "PUT"); }}>{t("Save preferences", "Guardar preferencias")}</button>
        <button disabled={busy} className="ml-3 rounded border p-2 disabled:opacity-50" onClick={() => { const { verified, ...settings } = pref; void verified; request("preferences", { ...settings, enabled: false }, "PUT"); }}>{t("Pause emails", "Pausar correos")}</button>
      </section>
    </>}
  </main>;
}
