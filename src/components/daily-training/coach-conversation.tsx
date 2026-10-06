"use client";

import React, { useCallback, useEffect, useId, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import {
  COACH_MESSAGE_LIMIT, COACH_REQUEST_TIMEOUT, COACH_SEND_TIMEOUT, COACH_VOICE_TIMEOUT,
  CoachRequestGate, readCoachResponse, coachExternalPermissions, coachConfirmationAttempt, coachSendAttempt, coachSendWasRecorded, coachPendingActions, editedCoachCandidate, mergeCoachSessions, validateCoachImage, verifiedCoachReceipt,
  type CoachCandidate, type CoachCapabilities, type CoachConfirmationAttempt, type CoachMessage, type CoachPayload, type CoachProposal, type CoachReceipt, type CoachSession, type CoachSendAttempt, type CoachSendBody,
} from "./coach-conversation-client";

type SpeechResult = { isFinal: boolean; 0: { transcript: string; confidence: number } };
type Recognition = {
  lang: string; interimResults: boolean; continuous: boolean;
  onresult: ((event: { results: ArrayLike<SpeechResult> }) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void; stop: () => void; abort: () => void;
};
type Screenshot = { name: string; dataUrl: string; mimeType: "image/png" | "image/jpeg" | "image/webp"; dataBase64: string };
type Props = { es: boolean; athleteId: string; offline?: boolean; sessions?: CoachSession[]; onConfirmed: () => Promise<void> | void };
const NO_SESSIONS: CoachSession[] = [];
const focus = "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ocean-700";
const inputClass = `input w-full ${focus}`;
const primaryClass = `btn-primary ${focus}`;
const secondaryClass = `btn-secondary ${focus}`;

const FIELD_LABELS: Record<string, [string, string]> = {
  goal: ["Training goal", "Objetivo de entrenamiento"], weeklyHours: ["Weekly training hours", "Horas de entrenamiento semanales"], weightKg: ["Body weight", "Peso corporal"],
  feedbackStatus: ["Workout result", "Resultado de la sesión"], actualDurationMin: ["Actual duration", "Duración realizada"], rpe: ["Perceived effort", "Esfuerzo percibido"], actualSport: ["Sport completed", "Deporte realizado"],
  durationMin: ["Planned duration", "Duración planificada"], sport: ["Planned sport", "Deporte planificado"], sleep: ["Sleep quality", "Calidad del sueño"], soreness: ["Soreness", "Dolor muscular"], motivation: ["Motivation", "Motivación"], energy: ["Energy", "Energía"], stress: ["Stress", "Estrés"], sick: ["Feeling sick", "Síntomas de enfermedad"], newPain: ["New pain", "Dolor nuevo"], urgentSymptoms: ["Urgent symptoms", "Síntomas urgentes"], painAffectsMovement: ["Pain affects movement", "El dolor afecta el movimiento"], availableMinutes: ["Available training time", "Tiempo disponible"], painLocation: ["Pain location", "Ubicación del dolor"],
};
const VALUE_CHOICES: Record<string, Array<[string, string, string]>> = {
  goal: [["sprint", "Sprint triathlon", "Triatlón sprint"], ["olympic", "Olympic triathlon", "Triatlón olímpico"], ["half", "Half-distance triathlon", "Triatlón de media distancia"], ["full", "Full-distance triathlon", "Triatlón de larga distancia"], ["hyrox", "HYROX", "HYROX"], ["boxing", "Boxing", "Boxeo"], ["run-only", "Running", "Carrera"], ["track-sprint", "Track sprint", "Velocidad en pista"], ["cycle", "Cycling", "Ciclismo"], ["swim-only", "Swimming", "Natación"], ["lifting", "Strength", "Fuerza"], ["5k", "5 km", "5 km"], ["10k", "10 km", "10 km"], ["half-marathon", "Half marathon", "Media maratón"], ["marathon", "Marathon", "Maratón"]],
  feedbackStatus: [["completed", "Completed", "Completada"], ["partial", "Partially completed", "Parcialmente completada"], ["substituted", "Substituted", "Sustituida"], ["skipped", "Skipped", "Omitida"]],
  actualSport: [["run", "Run", "Carrera"], ["bike", "Bike", "Ciclismo"], ["swim", "Swim", "Natación"], ["strength", "Strength", "Fuerza"], ["mobility", "Mobility", "Movilidad"], ["recovery", "Recovery", "Recuperación"], ["brick", "Brick", "Sesión combinada"], ["hyrox", "HYROX", "HYROX"], ["boxing", "Boxing", "Boxeo"], ["other", "Other", "Otro"]],
};
VALUE_CHOICES.sport = VALUE_CHOICES.actualSport;
const sourceLabel = (source: string, es: boolean) => source === "gemini" ? "Google Gemini" : source === "voice" ? (es ? "Voz revisada" : "Reviewed voice") : source === "image" ? (es ? "Captura" : "Screenshot") : (es ? "Texto" : "Text");
const fieldLabel = (field: string, es: boolean) => FIELD_LABELS[field]?.[es ? 1 : 0] || field;
const isSaveable = (candidate: CoachCandidate) => candidate.kind === "profile" || candidate.kind === "workout_feedback";

export function CoachConversation({ es, athleteId, offline = false, sessions: todaySessions = NO_SESSIONS, onConfirmed }: Props) {
  const id = useId();
  const [messages, setMessages] = useState<CoachMessage[]>([]);
  const [proposal, setProposal] = useState<CoachProposal | null>(null);
  const [receipt, setReceipt] = useState<CoachReceipt | null>(null);
  const [serverActions, setServerActions] = useState<string[]>([]);
  const [serverSessions, setServerSessions] = useState<CoachSession[]>([]);
  const [capabilities, setCapabilities] = useState<CoachCapabilities>({ externalAi: false, imageUnderstanding: false, textProvider: null, imageProvider: null });
  const [message, setMessage] = useState("");
  const [source, setSource] = useState<"text" | "voice">("text");
  const [sessionId, setSessionId] = useState("");
  const [externalConsent, setExternalConsent] = useState(false);
  const [imageConsent, setImageConsent] = useState(false);
  const [screenshot, setScreenshot] = useState<Screenshot | null>(null);
  const [imageBusy, setImageBusy] = useState(false);
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [operation, setOperation] = useState<"load" | "send" | "confirm" | "cancel" | "clear" | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [needsReload, setNeedsReload] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [mode, setMode] = useState("");
  const [imageStatus, setImageStatus] = useState("");
  const [clearReview, setClearReview] = useState(false);
  const [listening, setListening] = useState(false);
  const [voiceReview, setVoiceReview] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [voiceSupported, setVoiceSupported] = useState(false);
  const requestGate = useRef(new CoachRequestGate());
  const busy = useRef(false);
  const mounted = useRef(false);
  const activeOperation = useRef<typeof operation>(null);
  const fileReader = useRef<FileReader | null>(null);
  const fileEpoch = useRef(0);
  const fileTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const recognition = useRef<Recognition | null>(null);
  const voiceEpoch = useRef(0);
  const voiceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const confirmationAttempt = useRef<CoachConfirmationAttempt | null>(null);
  const sendAttempt = useRef<CoachSendAttempt | null>(null);
  const textInput = useRef<HTMLTextAreaElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const allSessions = mergeCoachSessions(serverSessions, todaySessions);
  const textConfigured = capabilities.externalAi === true && capabilities.textProvider === "Google Gemini";
  const imageConfigured = capabilities.imageUnderstanding === true && capabilities.imageProvider === "OpenAI";
  const permissions = coachExternalPermissions(capabilities, externalConsent, imageConsent);
  const canSendImage = !!screenshot && permissions.image;
  const blocked = offline || !loaded || needsReload || !!operation;
  const activeProposal = proposal && ["proposed", "pending"].includes(proposal.status) ? proposal : null;

  const stopVoice = useCallback(() => {
    voiceEpoch.current += 1;
    if (voiceTimer.current) clearTimeout(voiceTimer.current);
    voiceTimer.current = null;
    const current = recognition.current;
    recognition.current = null;
    if (current) { current.onresult = null; current.onerror = null; current.onend = null; try { current.abort(); } catch {} }
  }, []);

  const stopFile = useCallback(() => {
    fileEpoch.current += 1;
    if (fileTimer.current) clearTimeout(fileTimer.current);
    fileTimer.current = null;
    const current = fileReader.current;
    fileReader.current = null;
    if (current?.readyState === FileReader.LOADING) current.abort();
  }, []);

  const applyPayload = useCallback((payload: CoachPayload) => {
    if (!payload.conversation || !Array.isArray(payload.conversation.messages)) throw new Error(es ? "La conversación recibida no es válida." : "The conversation response is invalid.");
    setMessages(payload.conversation.messages);
    setServerActions(coachPendingActions(payload));
    const next = payload.proposal || null;
    setProposal(next);
    setSelected({});
    setEdits(Object.fromEntries((next?.candidates || []).map(candidate => [candidate.id, candidate.value === null ? "" : String(candidate.value)])));
    setReceipt(next && ["cancelled", "superseded"].includes(next.status) ? null : verifiedCoachReceipt(payload));
    if (Array.isArray(payload.sessions)) setServerSessions(payload.sessions);
    if (payload.capabilities) setCapabilities(payload.capabilities);
    if (payload.mode) setMode(payload.mode);
    if (payload.imageStatus) setImageStatus(payload.imageStatus);
  }, [es]);

  const request = useCallback(async (kind: NonNullable<typeof operation>, url: string, method = "GET", body?: unknown) => {
    if (busy.current) return null;
    busy.current = true;
    activeOperation.current = kind;
    const ticket = requestGate.current.begin();
    setOperation(kind); setError(""); setStatus("");
    let timedOut = false;
    const timeout = setTimeout(() => { timedOut = true; ticket.abort(); }, kind === "send" ? COACH_SEND_TIMEOUT : COACH_REQUEST_TIMEOUT);
    try {
      const response = await fetch(url, { method, cache: "no-store", signal: ticket.signal, ...(body === undefined ? {} : { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }) });
      const payload = await readCoachResponse(response, es);
      if (!ticket.current() || !mounted.current) return null;
      return payload;
    } catch (cause) {
      if (!mounted.current || !ticket.latest()) return null;
      setError(timedOut
        ? (es ? "La solicitud tardó demasiado. Recarga la conversación para comprobar si se completó antes de intentarlo de nuevo." : "The request timed out. Reload the conversation to check whether it completed before trying again.")
        : (cause instanceof Error ? cause.message : (es ? "No se pudo conectar." : "Could not connect.")));
      if (method !== "GET") setNeedsReload(true);
      return null;
    } finally {
      clearTimeout(timeout);
      // A dismissed request must not unlock a newer request.
      if (ticket.latest()) {
        busy.current = false; activeOperation.current = null;
        if (mounted.current) setOperation(null);
      }
    }
  }, [es]);

  const load = useCallback(async () => {
    const payload = await request("load", "/api/assistant");
    if (!payload || !mounted.current) return;
    try {
      applyPayload(payload); setLoaded(true); setNeedsReload(false);
      if (coachSendWasRecorded(sendAttempt.current, payload.conversation?.messages || [])) {
        sendAttempt.current = null;
        setMessage(""); setSource("text"); setScreenshot(null); setExternalConsent(false); setImageConsent(false);
        setStatus(es ? "Tu solicitud ya está registrada. Se muestra la conversación actual; no hace falta volver a enviarla." : "Your request is already recorded. Showing the current conversation; you do not need to send it again.");
      }
      const attempt = confirmationAttempt.current;
      if (attempt && payload.proposal?.id === attempt.proposalId && payload.proposal.revision === attempt.revision && ["pending", "proposed"].includes(payload.proposal.status)) {
        setSelected(Object.fromEntries(attempt.candidates.map(candidate => [candidate.id, true])));
        setEdits(current => ({ ...current, ...Object.fromEntries(attempt.candidates.map(candidate => [candidate.id, String(candidate.value ?? "")])) }));
      } else confirmationAttempt.current = null;
    }
    catch (cause) { setError((cause as Error).message); }
  }, [applyPayload, es, request]);

  useEffect(() => {
    mounted.current = true;
    const gate = requestGate.current;
    const scope = window as unknown as { SpeechRecognition?: unknown; webkitSpeechRecognition?: unknown };
    setVoiceSupported(!!(scope.SpeechRecognition || scope.webkitSpeechRecognition));
    void load();
    const interrupt = () => {
      const submitted = activeOperation.current && activeOperation.current !== "load";
      requestGate.current.cancel(); busy.current = false; activeOperation.current = null;
      stopVoice(); stopFile(); setOperation(null); setListening(false); setImageBusy(false); setExternalConsent(false); setImageConsent(false);
      if (submitted) { setNeedsReload(true); setStatus(es ? "Solicitud interrumpida. Recarga para verificar el resultado." : "Request interrupted. Reload to verify the result."); }
    };
    window.addEventListener("popstate", interrupt);
    return () => { mounted.current = false; gate.cancel(); busy.current = false; activeOperation.current = null; stopVoice(); stopFile(); window.removeEventListener("popstate", interrupt); };
  }, [athleteId, es, load, stopFile, stopVoice]);

  function cancelRequest() {
    const submitted = activeOperation.current !== "load";
    requestGate.current.cancel(); busy.current = false; activeOperation.current = null; setOperation(null); setExternalConsent(false); setImageConsent(false);
    if (submitted) setNeedsReload(true);
    setStatus(es ? "Espera cancelada. Una solicitud ya enviada puede haberse completado; recarga para verificar." : "Stopped waiting. A submitted request may have completed; reload to verify.");
  }

  async function send(event: React.FormEvent) {
    event.preventDefault();
    if (busy.current || blocked || listening || imageBusy || (!message.trim() && !canSendImage)) return;
    const outgoingImage = canSendImage ? { mimeType: screenshot!.mimeType, dataBase64: screenshot!.dataBase64 } : undefined;
    const outgoing: CoachSendBody = { message: message.trim(), source, externalConsent: permissions.text, ...(permissions.text ? { textProviderConsent: "gemini" } : {}), ...(outgoingImage ? { image: outgoingImage, imageConsent: true, imageProviderConsent: "openai" } : {}), ...(sessionId ? { sessionId } : {}) };
    sendAttempt.current = coachSendAttempt(sendAttempt.current, outgoing, () => crypto.randomUUID());
    setExternalConsent(false); setImageConsent(false);
    const payload = await request("send", "/api/assistant", "POST", { ...outgoing, clientRequestId: sendAttempt.current.clientRequestId });
    if (!payload || !mounted.current) return;
    try {
      applyPayload(payload); sendAttempt.current = null; setMessage(""); setSource("text"); if (outgoingImage) setScreenshot(null);
      setStatus(payload.replayed
        ? (es ? "Esta solicitud ya estaba registrada. Se muestra la conversación actual." : "This request was already recorded. Showing the current conversation.")
        : payload.disclosure || (es ? "Respuesta recibida. Revisa las propuestas; todavía no se han guardado cambios." : "Reply received. Review any proposed changes; no changes have been saved yet."));
    } catch (cause) { setError((cause as Error).message); setNeedsReload(true); }
  }

  async function confirm() {
    if (busy.current || blocked || !activeProposal) return;
    let candidates: CoachCandidate[];
    try {
      candidates = activeProposal.candidates.filter(candidate => selected[candidate.id]).map(candidate => editedCoachCandidate(candidate, edits[candidate.id] ?? ""));
      if (!candidates.length || candidates.some(candidate => candidate.kind === "workout_feedback" && !candidate.sessionId)) throw new Error("selection");
    } catch { setError(es ? "Selecciona los datos que deseas confirmar e introduce valores válidos. Los resultados requieren una sesión concreta." : "Select the facts to confirm and enter valid values. Workout results require a specific session."); return; }
    confirmationAttempt.current = coachConfirmationAttempt(confirmationAttempt.current, activeProposal, candidates, () => crypto.randomUUID());
    const payload = await request("confirm", "/api/assistant/confirm", "POST", { proposalId: activeProposal.id, expectedRevision: activeProposal.revision, candidates, idempotencyKey: confirmationAttempt.current.key, confirmed: true });
    if (!payload || !mounted.current) return;
    const verified = verifiedCoachReceipt(payload, activeProposal.id, candidates);
    if (!verified) { setNeedsReload(true); setError(es ? "No recibimos un comprobante verificable. Recarga antes de repetir; no se ha confirmado el guardado." : "No verifiable receipt was returned. Reload before retrying; saving is unconfirmed."); return; }
    try {
      applyPayload(payload); setReceipt(verified); confirmationAttempt.current = null;
      setStatus(verified.applied.length > 0 ? (es ? "Cambios confirmados y guardados. Los pasos pendientes se muestran abajo." : "Confirmed changes saved. Any pending steps are listed below.") : (es ? "Revisión registrada. No se han aplicado cambios al check-in ni al plan." : "Review recorded. No check-in or plan changes have been applied."));
      if (verified.applied.length > 0) await onConfirmed();
    } catch { if (mounted.current) setError(es ? "El comprobante confirma el guardado, pero no pudimos actualizar la vista. Recarga la página." : "The receipt confirms saving, but this view could not refresh. Reload the page."); }
  }

  async function dismissProposal() {
    if (!activeProposal || blocked || busy.current) return;
    const payload = await request("cancel", "/api/assistant/cancel", "POST", { proposalId: activeProposal.id });
    if (!payload || !mounted.current) return;
    if (payload.cancelled !== true) { setNeedsReload(true); setError(es ? "No se pudo verificar que la propuesta se descartó." : "Could not verify that the proposal was dismissed."); return; }
    try { applyPayload(payload); setStatus(es ? "Propuesta descartada. Tus datos no han cambiado." : "Proposal dismissed. Your facts have not changed."); }
    catch (cause) { setError((cause as Error).message); setNeedsReload(true); }
  }

  async function clearConversation() {
    if (blocked || busy.current) return;
    const payload = await request("clear", "/api/assistant", "DELETE", { confirmed: true });
    if (!payload || !mounted.current) return;
    if (payload.cleared !== true) { setNeedsReload(true); setError(es ? "No se ha confirmado el borrado de la conversación." : "Clearing the conversation is unconfirmed."); return; }
    try {
      applyPayload(payload); setClearReview(false); setMessage(""); setSource("text"); setScreenshot(null); setExternalConsent(false); setImageConsent(false); setVoiceReview(false); setTranscript(""); confirmationAttempt.current = null; sendAttempt.current = null;
      setStatus(es ? "Conversación borrada. Se conservan tus datos confirmados y el registro de cambios." : "Conversation cleared. Confirmed athlete facts and the change audit are retained.");
    } catch (cause) { setError((cause as Error).message); setNeedsReload(true); }
  }

  function chooseScreenshot(file: File | undefined) {
    stopFile(); setImageBusy(false); setScreenshot(null); setExternalConsent(false); setImageConsent(false); setError("");
    if (!file) return;
    const invalid = validateCoachImage(file);
    if (invalid) { setError(invalid === "type" ? (es ? "Elige un archivo PNG, JPEG o WebP." : "Choose a PNG, JPEG or WebP file.") : (es ? "La captura debe contener datos y pesar como máximo 2 MB." : "The screenshot must be nonempty and at most 2 MB.")); return; }
    const epoch = fileEpoch.current;
    const reader = new FileReader(); fileReader.current = reader; setImageBusy(true);
    fileTimer.current = setTimeout(() => { if (epoch !== fileEpoch.current || !mounted.current) return; stopFile(); setImageBusy(false); setError(es ? "No se pudo leer la captura a tiempo. Inténtalo de nuevo." : "Reading the screenshot timed out. Try again."); }, 10_000);
    const finish = () => { if (fileTimer.current) clearTimeout(fileTimer.current); fileTimer.current = null; fileReader.current = null; setImageBusy(false); };
    reader.onload = () => {
      if (epoch !== fileEpoch.current || !mounted.current) return;
      finish();
      if (typeof reader.result !== "string" || !reader.result.startsWith(`data:${file.type};base64,`)) { setError(es ? "No se pudo leer la captura." : "Could not read the screenshot."); return; }
      setScreenshot({ name: file.name, mimeType: file.type as Screenshot["mimeType"], dataUrl: reader.result, dataBase64: reader.result.slice(reader.result.indexOf(",") + 1) });
    };
    reader.onerror = () => { if (epoch !== fileEpoch.current || !mounted.current) return; finish(); setError(es ? "No se pudo leer la captura." : "Could not read the screenshot."); };
    try { reader.readAsDataURL(file); } catch { stopFile(); setImageBusy(false); setError(es ? "No se pudo abrir la captura. Elige otro archivo." : "Could not open the screenshot. Choose another file."); }
  }

  function startVoice() {
    if (blocked || listening) return;
    const scope = window as unknown as { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition };
    const Constructor = scope.SpeechRecognition || scope.webkitSpeechRecognition;
    if (!Constructor) { setError(es ? "Este navegador no admite dictado. Puedes escribir tu mensaje." : "This browser does not support dictation. You can type your message."); return; }
    stopVoice();
    const epoch = voiceEpoch.current;
    const rec = new Constructor(); recognition.current = rec;
    rec.lang = es ? "es-ES" : "en-US"; rec.interimResults = true; rec.continuous = false;
    let heard = ""; let lowConfidence = false;
    const current = () => mounted.current && epoch === voiceEpoch.current;
    rec.onresult = event => {
      if (!current()) return;
      heard = Array.from(event.results).map(result => { if (result.isFinal && result[0].confidence > 0 && result[0].confidence < 0.65) lowConfidence = true; return result[0].transcript; }).join(" ").slice(0, COACH_MESSAGE_LIMIT);
      setTranscript(heard);
    };
    rec.onerror = () => { if (!current()) return; stopVoice(); setListening(false); setVoiceReview(!!heard.trim()); setError(es ? "El dictado se interrumpió o no recibió permiso. Revisa el texto o escribe tu mensaje; no se ha enviado nada." : "Dictation was interrupted or permission was not granted. Review the text or type your message; nothing was sent."); };
    rec.onend = () => {
      if (!current()) return;
      stopVoice(); setListening(false); setVoiceReview(!!heard.trim());
      setStatus(heard.trim() ? (lowConfidence ? (es ? "Algunas palabras no se oyeron con claridad. Corrige la transcripción antes de usarla." : "Some words were unclear. Correct the transcript before using it.") : (es ? "Revisa la transcripción. Todavía no se ha enviado." : "Review the transcript. It has not been sent.")) : (es ? "No se recibió una transcripción. Puedes intentarlo de nuevo o escribir." : "No transcript was received. Try again or type your message."));
    };
    setTranscript(""); setVoiceReview(false); setError(""); setListening(true);
    voiceTimer.current = setTimeout(() => { if (!current()) return; stopVoice(); setListening(false); setVoiceReview(!!heard.trim()); setStatus(es ? "Se alcanzó el límite de un minuto. Revisa el texto antes de usarlo." : "The one-minute limit was reached. Review the text before using it."); }, COACH_VOICE_TIMEOUT);
    try { rec.start(); } catch { stopVoice(); setListening(false); setError(es ? "No se pudo iniciar el micrófono. Puedes escribir." : "The microphone could not start. You can type instead."); }
  }

  function useTranscript() {
    if (!transcript.trim() || listening || blocked) return;
    const combined = [message.trim(), transcript.trim()].filter(Boolean).join("\n");
    if (combined.length > COACH_MESSAGE_LIMIT) { setError(es ? "El texto supera el límite. Acorta el mensaje antes de añadir la transcripción." : "The text exceeds the limit. Shorten your message before adding the transcript."); return; }
    setMessage(combined); setSource("voice"); setVoiceReview(false); setTranscript(""); textInput.current?.focus();
    setStatus(es ? "Transcripción revisada añadida al mensaje. Pulsa Enviar para conversar; no guarda datos por sí sola." : "Reviewed transcript added to your message. Press Send to chat; this does not save athlete facts.");
  }

  const pendingActions = [...new Set([...serverActions, ...(receipt?.pendingActions || []), ...(proposal && !["cancelled", "superseded"].includes(proposal.status) ? proposal.pendingActions || [] : [])])];
  const pendingDrafts = [...(receipt?.checkinDraft || []), ...(receipt?.planDraft || [])];
  const selectedCount = activeProposal?.candidates.filter(candidate => selected[candidate.id]).length || 0;

  return <section id="jasai" aria-labelledby={`${id}-title`} className="card space-y-4 scroll-mt-24" lang={es ? "es" : "en"}>
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div><h2 id={`${id}-title`} className="font-display text-xl font-bold">{es ? "Conversar con KCoach" : "Ask KCoach"}</h2>
        <p className="text-sm text-slate-700 mt-1">{es ? "Cuenta cómo te fue o qué necesitas. La conversación continúa cuando vuelves. Tú revisas y confirmas cada dato antes de guardarlo." : "Share how training went or what you need. Your conversation continues when you return. You review and confirm each fact before it is saved."}</p></div>
      <button type="button" className={secondaryClass} disabled={blocked || listening || imageBusy || !messages.length} onClick={() => setClearReview(true)}>{es ? "Borrar conversación" : "Clear conversation"}</button>
    </div>
    {clearReview && <div className="rounded-lg border border-amber-400 bg-amber-50 p-3 space-y-3" role="group" aria-label={es ? "Confirmar borrado" : "Confirm conversation clearing"}>
      <p>{es ? "¿Borrar solo esta conversación y sus propuestas pendientes? Los datos de perfil, resultados, check-ins y el registro de cambios confirmados se conservan." : "Clear only this conversation and its pending proposals? Profile facts, workout results, check-ins and the confirmed change audit are retained."}</p>
      <div className="flex flex-wrap gap-2"><button type="button" className={secondaryClass} disabled={blocked} onClick={() => setClearReview(false)}>{es ? "Conservar conversación" : "Keep conversation"}</button><button type="button" className={primaryClass} disabled={blocked} onClick={() => void clearConversation()}>{es ? "Sí, borrar conversación" : "Yes, clear conversation"}</button></div>
    </div>}
    {operation && <div role="status" className="flex flex-wrap items-center gap-3 text-sm"><span>{operation === "load" ? (es ? "Cargando conversación…" : "Loading conversation…") : operation === "confirm" ? (es ? "Comprobando y guardando…" : "Verifying and saving…") : (es ? "Procesando solicitud…" : "Processing request…")}</span><button type="button" className={secondaryClass} onClick={cancelRequest}>{es ? "Dejar de esperar" : "Stop waiting"}</button></div>}
    {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-red-800">{error}</p>}
    {status && <p role="status" className="rounded-lg bg-slate-50 p-3 text-sm text-slate-800">{status}</p>}
    {(!loaded || needsReload) && !operation && <button type="button" className={secondaryClass} disabled={offline} onClick={() => void load()}>{es ? "Recargar conversación" : "Reload conversation"}</button>}
    {offline && <p role="status" className="text-sm text-amber-900">{es ? "Sin conexión. Conéctate antes de enviar mensajes o confirmar cambios." : "Offline. Reconnect before sending messages or confirming changes."}</p>}
    <ol className="max-h-96 overflow-y-auto space-y-3 rounded-lg border p-3" aria-label={es ? "Historial de conversación" : "Conversation history"} aria-live="polite" aria-relevant="additions" tabIndex={0}>
      {messages.map(entry => <li key={entry.id} className={`rounded-lg p-3 ${entry.role === "user" ? "bg-ocean-50" : "bg-slate-50"}`}>
        <p className="text-xs font-semibold text-slate-700">{entry.role === "user" ? (es ? "Tú" : "You") : "KCoach"} · {sourceLabel(entry.source, es)} · <time dateTime={entry.createdAt}>{new Date(entry.createdAt).toLocaleString(es ? "es" : "en")}</time></p>
        <p className="mt-1 whitespace-pre-wrap break-words">{entry.content}</p>
      </li>)}
      {loaded && !messages.length && <li className="text-sm text-slate-700">{es ? "Empieza con lo que sabes, aunque no tengas reloj: «Hoy corrí 30 minutos, RPE 4». Elige primero la sesión correcta." : "Start with what you know, even without a watch: “Today I ran for 30 minutes, RPE 4.” Choose the correct workout first."}</li>}
    </ol>
    {mode && <p className="text-xs text-slate-700">{mode === "kcoach_ai" || mode === "coach_ai" ? (es ? "Explicación educativa del catálogo, seleccionada con Google Gemini. Las recomendaciones personales, los datos guardados y los cambios se gestionan en el modo local." : "Approved educational explanation selected with Google Gemini. Personal coaching, saved facts and changes are handled locally.") : (es ? "Respuesta de texto local: usa reglas y tus datos de la app. El análisis de imágenes, si se utiliza, se indica por separado." : "Local text response: uses rules and your in-app data. Image analysis, if used, is identified separately.")}</p>}
    {imageStatus === "extracted" && <p className="text-xs text-slate-700">{es ? "Captura analizada por OpenAI. Verifica cada valor, fecha y unidad antes de confirmar; el análisis puede equivocarse." : "Screenshot analyzed by OpenAI. Check every value, date and unit before confirming; extraction can be wrong."}</p>}
    {(imageStatus === "unavailable" || imageStatus === "not_configured") && <p className="text-xs text-amber-900">{es ? "No se pudo analizar la captura. Escribe los datos visibles para revisarlos; no se han inventado valores." : "The screenshot could not be analyzed. Type its visible details for review; no values were guessed."}</p>}
    {activeProposal && <div className="rounded-xl border-2 border-ocean-300 p-4 space-y-3">
      <h3 className="font-bold">{es ? "Revisa los datos propuestos" : "Review proposed facts"}</h3>
      <p className="text-sm text-slate-700">{es ? "Selecciona solo los datos correctos. Puedes editar el valor o dejarlo sin seleccionar. El perfil y los resultados se guardan al confirmar; el check-in y el plan requieren revisión en su pantalla." : "Select only correct facts. Edit a value or leave it unselected. Profile facts and workout results save on confirmation; check-in and plan changes need review in their own screen."}</p>
      {activeProposal.candidates.map(candidate => {
        const target = allSessions.find(session => session.id === candidate.sessionId);
        const ambiguous = candidate.kind === "workout_feedback" && !candidate.sessionId;
        const candidateId = `${id}-${candidate.id}`;
        return <fieldset key={candidate.id} disabled={blocked || ambiguous} className="rounded-lg border p-3 space-y-2 min-w-0">
          <legend className="px-1 font-semibold">{fieldLabel(candidate.field, es)}</legend>
          <label className="flex items-center gap-2 min-h-8"><input type="checkbox" className={`h-5 w-5 ${focus}`} checked={!!selected[candidate.id]} onChange={event => setSelected(current => ({ ...current, [candidate.id]: event.target.checked }))} />{es ? "Incluir al confirmar" : "Include in confirmation"}</label>
          <label htmlFor={candidateId} className="block text-sm font-medium">{es ? "Valor" : "Value"}</label>
          {typeof candidate.value === "boolean" ? <select id={candidateId} className={inputClass} value={edits[candidate.id] ?? ""} onChange={event => setEdits(current => ({ ...current, [candidate.id]: event.target.value }))}><option value="true">{es ? "Sí" : "Yes"}</option><option value="false">{es ? "No" : "No"}</option></select> : VALUE_CHOICES[candidate.field] ? <select id={candidateId} className={inputClass} value={edits[candidate.id] ?? ""} onChange={event => setEdits(current => ({ ...current, [candidate.id]: event.target.value }))}>{VALUE_CHOICES[candidate.field].map(([value, en, spanish]) => <option key={value} value={value}>{es ? spanish : en}</option>)}</select> : <input id={candidateId} className={inputClass} type={typeof candidate.value === "number" ? "number" : "text"} step="any" maxLength={500} value={edits[candidate.id] ?? ""} onChange={event => setEdits(current => ({ ...current, [candidate.id]: event.target.value }))} />}
          <dl className="grid grid-cols-1 sm:grid-cols-2 gap-1 text-sm text-slate-700">
            <div><dt className="inline font-medium">{es ? "Campo: " : "Field: "}</dt><dd className="inline break-words">{candidate.field}</dd></div>
            <div><dt className="inline font-medium">{es ? "Unidad: " : "Unit: "}</dt><dd className="inline">{candidate.unit || (es ? "No aplica" : "Not applicable")}</dd></div>
            <div><dt className="inline font-medium">{es ? "Fecha: " : "Date: "}</dt><dd className="inline">{candidate.observedDate || (es ? "Perfil, sin fecha" : "Profile, no date")}</dd></div>
            <div><dt className="inline font-medium">{es ? "Fuente: " : "Source: "}</dt><dd className="inline">{sourceLabel(candidate.source, es)}</dd></div>
          </dl>
          <p className="text-sm break-words"><span className="font-medium">{es ? "Evidencia: " : "Evidence: "}</span>{candidate.evidence}</p>
          {candidate.kind === "workout_feedback" && <p className="text-sm font-medium">{es ? "Sesión: " : "Workout: "}{target ? `${target.date} · ${target.title} · ${target.sport}` : candidate.sessionId || (es ? "Sin seleccionar. Elige una sesión abajo y vuelve a enviar los detalles." : "Not selected. Choose a workout below and send the details again.")}</p>}
          {candidate.kind === "profile" && candidate.field === "goal" && <p className="text-sm text-slate-700">{es ? "Este es tu objetivo aspiracional. No demuestra tu capacidad actual ni cambia el plan por sí solo." : "This is your aspirational goal. It does not establish current ability or change the plan by itself."}</p>}
          {!isSaveable(candidate) && <p className="text-sm font-medium text-amber-900">{es ? "Pendiente: confirmar aquí no aplica este cambio." : "Pending: confirming here does not apply this change."}</p>}
          {candidate.warnings?.map((warning, index) => <p key={index} className="text-sm text-amber-900">{warning}</p>)}
        </fieldset>;
      })}
      <div className="flex flex-wrap gap-2"><button type="button" className={primaryClass} disabled={blocked || selectedCount === 0} onClick={() => void confirm()}>{es ? `Confirmar ${selectedCount} datos seleccionados` : `Confirm ${selectedCount} selected facts`}</button><button type="button" className={secondaryClass} disabled={blocked} onClick={() => void dismissProposal()}>{es ? "Descartar propuesta" : "Dismiss proposal"}</button></div>
      <p className="text-xs text-slate-700">{es ? "Si la fecha, unidad o sesión no es correcta, descarta la propuesta y aclárala en un mensaje nuevo." : "If the date, unit or workout is wrong, dismiss the proposal and clarify it in a new message."}</p>
    </div>}
    {receipt && <div className="rounded-lg border border-green-700 bg-green-50 p-3 space-y-2">
      <h3 className="font-semibold">{receipt.applied.length ? (es ? "Cambios guardados con comprobante" : "Saved changes with receipt") : (es ? "Revisión registrada; cambios pendientes" : "Review recorded; changes pending")}</h3>
      {receipt.applied.length > 0 && <ul className="text-sm list-disc pl-5">{receipt.applied.map(entry => <li key={entry.candidateId}>{fieldLabel(entry.field, es)}: {typeof entry.value === "boolean" ? (entry.value ? (es ? "Sí" : "Yes") : "No") : String(entry.value ?? "—")}{entry.observedDate ? ` · ${entry.observedDate}` : ""}</li>)}</ul>}
      <p className="text-xs text-slate-700 break-all">{es ? "Comprobante" : "Receipt"}: {receipt.id} · <time dateTime={receipt.confirmedAt}>{new Date(receipt.confirmedAt).toLocaleString(es ? "es" : "en")}</time></p>
    </div>}
    {!!pendingActions.length && <div className="rounded-lg border border-amber-400 bg-amber-50 p-3 space-y-2">
      <h3 className="font-semibold">{es ? "Siguiente paso pendiente" : "Pending next step"}</h3>
      <p className="text-sm">{es ? "Estos cambios todavía no se han aplicado. Completa la revisión en la pantalla correspondiente." : "These changes have not been applied. Complete the review in the relevant screen."}</p>
      {pendingDrafts.length > 0 && <><p className="text-sm">{es ? "Valores revisados para introducir en esa pantalla:" : "Reviewed values to enter in that screen:"}</p><ul className="list-disc pl-5 text-sm">{pendingDrafts.map(candidate => <li key={candidate.id}>{fieldLabel(candidate.field, es)}: {typeof candidate.value === "boolean" ? (candidate.value ? (es ? "Sí" : "Yes") : "No") : String(candidate.value ?? "—")}{candidate.unit ? ` ${candidate.unit}` : ""} · {candidate.observedDate || "—"} · {sourceLabel(candidate.source, es)}</li>)}</ul></>}
      <div className="flex flex-wrap gap-2">{pendingActions.includes("review_checkin") && <Link className={secondaryClass} href="/checkin">{es ? "Completar check-in actual" : "Complete current check-in"}</Link>}{pendingActions.includes("review_plan") && <Link className={secondaryClass} href="/training">{es ? "Revisar plan" : "Review plan"}</Link>}</div>
    </div>}
    <form onSubmit={send} className="space-y-3">
      <label className="block text-sm font-medium" htmlFor={`${id}-session`}>{es ? "Sesión sobre la que hablas (para registrar resultados)" : "Workout you are discussing (for logging results)"}</label>
      <select id={`${id}-session`} className={inputClass} value={sessionId} disabled={blocked || listening} onChange={event => setSessionId(event.target.value)}>
        <option value="">{es ? "Sin sesión seleccionada" : "No workout selected"}</option>
        {allSessions.map(session => <option value={session.id} key={session.id}>{session.date} · {session.title} · {session.sport}</option>)}
      </select>
      <p className="text-xs text-slate-700">{es ? "Comprueba la fecha y el deporte. No se adivina qué sesión debe recibir los resultados. Si no aparece, abre Entrenamiento." : "Check the date and sport. We do not guess which workout should receive results. If it is missing, open Training."} <Link className={`underline ${focus}`} href="/training">{es ? "Entrenamiento" : "Training"}</Link></p>
      <label className="block font-medium" htmlFor={`${id}-message`}>{source === "voice" ? (es ? "Mensaje con transcripción revisada" : "Message with reviewed transcript") : (es ? "Tu mensaje" : "Your message")}</label>
      <textarea ref={textInput} id={`${id}-message`} className={inputClass} rows={3} maxLength={COACH_MESSAGE_LIMIT} value={message} disabled={blocked || listening} onChange={event => setMessage(event.target.value)} placeholder={es ? "Qué hiciste, cuánto tiempo, cómo te sentiste…" : "What you did, how long, how it felt…"} />
      <p className="text-xs text-slate-700">{message.length}/{COACH_MESSAGE_LIMIT}</p>
      <div className="rounded-lg border p-3 space-y-2">
        <p className="text-sm text-slate-700">{es ? "Dictado opcional en español. Tu navegador puede enviar el audio a su proveedor de reconocimiento. Revisa el texto antes de usarlo; el micrófono nunca guarda ni envía el mensaje automáticamente." : "Optional English dictation. Your browser may send audio to its speech-recognition provider. Review the text before using it; the microphone never saves facts or sends your message automatically."}</p>
        {!listening ? <button type="button" className={secondaryClass} disabled={blocked || imageBusy || !voiceSupported} onClick={startVoice}>{es ? "Iniciar dictado" : "Start dictation"}</button> : <div className="flex flex-wrap gap-2"><span role="status">{es ? "Escuchando…" : "Listening…"}</span><button type="button" className={secondaryClass} onClick={() => recognition.current?.stop()}>{es ? "Terminar y revisar" : "Stop and review"}</button><button type="button" className={secondaryClass} onClick={() => { stopVoice(); setListening(false); setVoiceReview(false); setTranscript(""); }}>{es ? "Cancelar dictado" : "Cancel dictation"}</button></div>}
        {!voiceSupported && <p className="text-xs text-slate-700">{es ? "El dictado no está disponible en este navegador. La escritura sigue disponible." : "Dictation is unavailable in this browser. Typing is still available."}</p>}
        {(voiceReview || listening) && <div className="space-y-2"><label className="block font-medium" htmlFor={`${id}-transcript`}>{es ? "Revisa y corrige la transcripción" : "Review and correct the transcript"}</label><textarea id={`${id}-transcript`} className={inputClass} rows={3} value={transcript} maxLength={COACH_MESSAGE_LIMIT} disabled={listening || blocked} onChange={event => setTranscript(event.target.value)} />{!listening && <div className="flex flex-wrap gap-2"><button type="button" className={secondaryClass} disabled={blocked || !transcript.trim()} onClick={useTranscript}>{es ? "Usar transcripción revisada" : "Use reviewed transcript"}</button><button type="button" className={secondaryClass} onClick={() => { setVoiceReview(false); setTranscript(""); }}>{es ? "Descartar transcripción" : "Discard transcript"}</button></div>}</div>}
      </div>
      <div className="rounded-lg border p-3 space-y-2">
        <label htmlFor={`${id}-image`} className="block text-sm font-medium">{es ? "Captura opcional (PNG, JPEG o WebP, máximo 2 MB)" : "Optional screenshot (PNG, JPEG or WebP, at most 2 MB)"}</label>
        <input ref={fileInput} id={`${id}-image`} type="file" accept="image/png,image/jpeg,image/webp" className={`block max-w-full text-sm ${focus}`} disabled={blocked || listening} onChange={event => { chooseScreenshot(event.target.files?.[0]); event.target.value = ""; }} />
        {imageBusy && <p role="status" className="text-sm">{es ? "Leyendo archivo local…" : "Reading local file…"}</p>}
        {screenshot && <div className="space-y-2"><Image src={screenshot.dataUrl} width={320} height={200} unoptimized className="h-48 w-full max-w-sm object-contain rounded border" alt={es ? "Vista previa de la captura elegida" : "Preview of selected screenshot"} /><p className="text-xs break-words">{screenshot.name}</p><button type="button" className={secondaryClass} disabled={!!operation} onClick={() => { stopFile(); setImageBusy(false); setScreenshot(null); setExternalConsent(false); setImageConsent(false); }}>{es ? "Quitar captura" : "Remove screenshot"}</button></div>}
        {!imageConfigured && <p className="text-sm text-amber-900">{es ? "El análisis de imágenes no está configurado. La captura solo se previsualiza aquí y no se enviará. Describe sus datos en tu mensaje; no se extraerán valores inventados." : "Image analysis is not configured. The screenshot is previewed here only and will not be sent. Describe its details in your message; no values will be guessed."}</p>}
        <label className="flex items-start gap-2 text-sm"><input type="checkbox" className={`mt-1 h-5 w-5 shrink-0 ${focus}`} checked={imageConsent} disabled={blocked || !imageConfigured || !screenshot} onChange={event => setImageConsent(event.target.checked)} /><span>{es ? "Permitir a OpenAI analizar esta captura y las instrucciones de extracción, solo para esta respuesta. La imagen puede contener datos personales o de salud. No se comparte mi perfil, conversación ni sesión seleccionada para analizar la imagen." : "Allow OpenAI to analyze this screenshot and extraction instructions, for this reply only. The image may contain personal or health data. My profile, conversation and selected session are not shared for image analysis."}</span></label>
        {screenshot && imageConfigured && !imageConsent && <p className="text-sm text-amber-900">{es ? "La captura no se enviará sin tu consentimiento para OpenAI. Puedes enviar solo el texto." : "The screenshot will not be sent without your OpenAI consent. You can send text only."}</p>}
      </div>
      <div className="rounded-lg border p-3 space-y-2">
        <label className="flex items-start gap-2 text-sm"><input type="checkbox" className={`mt-1 h-5 w-5 shrink-0 ${focus}`} checked={externalConsent} disabled={blocked || !textConfigured} onChange={event => setExternalConsent(event.target.checked)} /><span>{es ? "Permitir a Google Gemini procesar solo este mensaje y el idioma elegido para seleccionar una explicación del catálogo educativo limitado de la app. El mensaje puede incluir datos de salud que escribas. No se envían el perfil, el historial de conversación, la captura ni credenciales. Las decisiones personales de entrenamiento siguen en el modo local." : "Allow Google Gemini to process only this message and the selected language to select an explanation from the app’s bounded educational catalog. The message may include health data you type. Profile facts, conversation history, the screenshot and credentials are not sent. Personal training decisions stay local."}</span></label>
        {!textConfigured && <p className="text-xs text-slate-700">{es ? "Google Gemini no está configurado. Puedes seguir conversando en modo local." : "Google Gemini is not configured. You can keep chatting in local mode."}</p>}
      </div>
      <button className={primaryClass} disabled={blocked || listening || imageBusy || (!message.trim() && !canSendImage)} type="submit">{screenshot && !canSendImage ? (es ? "Enviar solo texto" : "Send text only") : source === "voice" ? (es ? "Enviar mensaje revisado" : "Send reviewed message") : (es ? "Enviar mensaje" : "Send message")}</button>
      <p className="text-xs text-slate-700">{es ? "Enviar un mensaje no confirma cambios. Puedes confirmar objetivo, horas semanales, peso y resultados de sesión (estado, minutos, deporte y RPE). Las preferencias de comunicación no cambian." : "Sending a message does not confirm changes. Supported facts: goal, weekly hours, weight and workout results (outcome, minutes, sport and RPE). Communication preferences stay unchanged."}</p>
    </form>
  </section>;
}
