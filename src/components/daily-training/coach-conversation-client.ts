/** Browser-only interaction helpers. No athlete facts are inferred here. */
import { fmtHeight, fmtWeight, heightFromFeetInches, heightToFeetInches, weightFromDisplay, weightToDisplay, type UnitSystem } from "@/lib/units";
export type CoachMessage = { id: string; role: string; content: string; createdAt: string; source: string; clientRequestId?: string;needsHumanReview?:boolean;localContextSummary?:string };
export type CoachCandidate = {
  id: string;
  kind: "profile" | "workout_feedback" | "workout_plan" | "checkin";
  field: string;
  value: string | number | boolean | null;
  unit: string | null;
  observedDate: string | null;
  source: "text" | "voice" | "image";
  evidence: string;
  sessionId?: string | null;
  status: string;
  warnings?: string[];
};
export type CoachProposal = { id: string; revision: number; status: string; candidates: CoachCandidate[]; beforeValues?: Record<string, CoachCandidate["value"]>; pendingActions?: string[] };
export type CoachSession = { id: string; title: string; sport: string; date: string };
export type CoachReceipt = {
  id: string; proposalId: string; confirmedAt: string;
  applied: Array<{ candidateId: string; kind: string; field: string; value: CoachCandidate["value"]; previousValue?: CoachCandidate["value"]; source: string; observedDate: string | null; sessionId?: string | null }>;
  pendingActions: string[];
  checkinDraft?: CoachCandidate[];
  planDraft?: CoachCandidate[];
};
export type CoachPayload = {
  ok: boolean;
  error?: string;
  conversation?: { id: string; messages: CoachMessage[] };
  proposal?: CoachProposal | null;
  sessions?: CoachSession[];
  defaultSessionId?:string|null;
  receipt?: CoachReceipt | null;
  savedReceipt?: CoachReceipt | null;
  capabilities?: CoachCapabilities;
  displayUnits?: UnitSystem;
  unitPreference?: string;
  mode?: string;
  disclosure?: string;
  externalStatus?: string;
  imageStatus?: string;
  applied?: boolean;
  cleared?: boolean;
  cancelled?: boolean;
  replayed?: boolean;
  pendingActions?: string[];
};

export type CoachCapabilities = { externalAi?: boolean; imageUnderstanding?: boolean; textProvider?: string | null; imageProvider?: string | null };
export function coachExternalPermissions(capabilities: CoachCapabilities, textConsent: boolean, imageConsent: boolean) {
  return {
    text: capabilities.externalAi === true && capabilities.textProvider === "DeepSeek" && textConsent === true,
    image: capabilities.imageUnderstanding === true && capabilities.imageProvider === "OpenAI" && imageConsent === true,
  };
}

export function coachTextStatusMessage(status: string, es: boolean): string | null {
  if (status === "unavailable") return es ? "DeepSeek no pudo responder. Se muestra la respuesta local de JMM; no se utilizó otro proveedor de texto." : "DeepSeek could not answer. JMM's local reply is shown; no other text provider was used.";
  if (status === "not_configured") return es ? "DeepSeek no está configurado. Se muestra la respuesta local de JMM." : "DeepSeek is not configured. JMM's local reply is shown.";
  if (status === "policy_local") return es ? "Respuesta dentro de JMM: las decisiones de seguridad, cálculos verificados, datos restringidos y cambios propuestos se gestionan en la app." : "Answered within JMM: safety decisions, verified calculations, restricted data and proposed changes stay in the app.";
  return null;
}

export const COACH_IMAGE_LIMIT = 2 * 1024 * 1024;
export const COACH_MESSAGE_LIMIT = 4000;
export const COACH_REQUEST_TIMEOUT = 35_000;
export const COACH_SEND_TIMEOUT = 60_000;
export const COACH_VOICE_TIMEOUT = 60_000;

/** Handle expired sessions and non-JSON gateway failures without leaking response bodies. */
export async function readCoachResponse(response: Response, es: boolean): Promise<CoachPayload> {
  if (response.status === 401) throw new Error(es
    ? "Tu sesión ha caducado. Inicia sesión de nuevo y recarga la conversación."
    : "Your session expired. Sign in again, then reload the conversation.");
  let payload: CoachPayload;
  try { payload = await response.json(); }
  catch { throw new Error(es ? "El servicio no respondió correctamente. Recarga la conversación para verificar el resultado." : "The service did not respond correctly. Reload the conversation to verify the result."); }
  if (!payload || typeof payload !== "object" || !response.ok || payload.ok !== true) {
    throw new Error(typeof payload?.error === "string" ? payload.error : (es ? "La solicitud no se completó. Recarga la conversación." : "The request did not complete. Reload the conversation."));
  }
  return payload;
}

export function validateCoachImage(file: { size: number; type: string }): "type" | "size" | null {
  if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) return "type";
  if (!Number.isSafeInteger(file.size) || file.size <= 0 || file.size > COACH_IMAGE_LIMIT) return "size";
  return null;
}

/** Every new operation invalidates old continuations, even if abort is ignored. */
export class CoachRequestGate {
  private epoch = 0;
  private controller: AbortController | null = null;
  begin() {
    this.cancel();
    const epoch = this.epoch;
    const controller = new AbortController();
    this.controller = controller;
    return { signal: controller.signal, current: () => this.epoch === epoch && !controller.signal.aborted, latest: () => this.epoch === epoch, abort: () => controller.abort() };
  }
  cancel() { this.epoch += 1; this.controller?.abort(); this.controller = null; }
}

export function coachCandidateInput(candidate: CoachCandidate, units: UnitSystem): string {
  if (candidate.value === null) return "";
  if (typeof candidate.value === "number" && coachWeightCandidate(candidate)) return String(Number(weightToDisplay(candidate.value, units).toFixed(3)));
  if (candidate.kind === "profile" && typeof candidate.value === "number") {
    if (candidate.field === "heightCm" && units === "imperial") {
      const height = heightToFeetInches(candidate.value);
      return `${height.feet} ft ${Number(height.inches.toFixed(3))} in`;
    }
  }
  return String(candidate.value);
}

function coachWeightCandidate(candidate: CoachCandidate): boolean {
  return ["profile", "checkin"].includes(candidate.kind) && candidate.field === "weightKg" || candidate.kind === "workout_feedback" && ["preWeightKg", "postWeightKg"].includes(candidate.field);
}

export function coachCandidateUnit(candidate: CoachCandidate, units: UnitSystem): string | null {
  if (coachWeightCandidate(candidate)) return units === "imperial" ? "lb" : "kg";
  if (candidate.kind === "profile" && candidate.field === "heightCm") return units === "imperial" ? "ft / in" : "cm";
  return candidate.unit;
}

export function coachDisplayValue(field: string, value: CoachCandidate["value"] | undefined, unit: string | null, units: UnitSystem, es = false): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "number" && ["weightKg", "preWeightKg", "postWeightKg"].includes(field)) return fmtWeight(value, units);
  if (typeof value === "number" && field === "heightCm") return fmtHeight(value, units);
  if (typeof value === "boolean") return value ? (es ? "Sí" : "Yes") : "No";
  return `${value}${unit ? ` ${unit}` : ""}`;
}

export function editedCoachCandidate(candidate: CoachCandidate, raw: string, units?: UnitSystem): CoachCandidate {
  // Display rounding must not rewrite an unchanged canonical value.
  if (units && raw === coachCandidateInput(candidate, units)) return { ...candidate };
  if (units && candidate.kind === "profile" && candidate.field === "heightCm" && units === "imperial") {
    const match = /^(\d+)\s*(?:ft|')\s*(\d+(?:\.\d+)?)\s*(?:in|")$/i.exec(raw.trim());
    if (!match || Number(match[2]) >= 12) throw new Error("height");
    return { ...candidate, value: heightFromFeetInches(Number(match[1]), Number(match[2])) };
  }
  let value: CoachCandidate["value"] = raw.trim();
  if (typeof candidate.value === "number") {
    if (!value || !Number.isFinite(Number(value))) throw new Error("number");
    value = Number(value);
    if (units && coachWeightCandidate(candidate)) value = weightFromDisplay(value, units);
  } else if (typeof candidate.value === "boolean") {
    if (value !== "true" && value !== "false") throw new Error("boolean");
    value = value === "true";
  } else if (!value) throw new Error("empty");
  return { ...candidate, value };
}

/** A successful HTTP response alone cannot support a claim that facts were saved. */
export function verifiedCoachReceipt(payload: CoachPayload, proposalId?: string, selected?: CoachCandidate[]): CoachReceipt | null {
  const receipt = payload.receipt;
  if (!payload.ok || !receipt || typeof receipt.id !== "string" || !receipt.id || typeof receipt.proposalId !== "string" || !receipt.proposalId || typeof receipt.confirmedAt !== "string" || !Number.isFinite(Date.parse(receipt.confirmedAt)) || !Array.isArray(receipt.applied) || !Array.isArray(receipt.pendingActions)) return null;
  if (!receipt.applied.every(entry => entry && typeof entry === "object" && typeof entry.candidateId === "string" && typeof entry.field === "string" && (entry.value === null || ["string", "boolean"].includes(typeof entry.value) || (typeof entry.value === "number" && Number.isFinite(entry.value))))) return null;
  if (!receipt.pendingActions.every(action => ["review_checkin", "review_plan"].includes(action))) return null;
  if (proposalId && receipt.proposalId !== proposalId) return null;
  if (payload.applied !== undefined && (!payload.proposal || payload.proposal.id === receipt.proposalId) && payload.applied !== (receipt.applied.length > 0)) return null;
  if (new Set(receipt.applied.map(entry => entry.candidateId)).size !== receipt.applied.length) return null;
  if (selected && receipt.applied.length !== selected.filter(candidate => ["profile", "workout_feedback", "workout_plan"].includes(candidate.kind)).length) return null;
  if (!receipt.applied.every(entry =>
    !!entry.candidateId && ["profile", "workout_feedback", "workout_plan"].includes(entry.kind) && typeof entry.field === "string" && ["text", "voice", "image"].includes(entry.source) &&
    (!selected || selected.some(candidate => candidate.id === entry.candidateId && candidate.kind === entry.kind && candidate.field === entry.field && candidate.value === entry.value && candidate.source === entry.source && candidate.observedDate === entry.observedDate && (candidate.sessionId ?? null) === (entry.sessionId ?? null))))) return null;
  return receipt;
}

export type CoachConfirmationAttempt = { signature: string; key: string; proposalId: string; revision: number; candidates: CoachCandidate[] };
export function coachConfirmationAttempt(previous: CoachConfirmationAttempt | null, proposal: Pick<CoachProposal, "id" | "revision">, candidates: CoachCandidate[], createKey: () => string): CoachConfirmationAttempt {
  const signature = JSON.stringify({ proposalId: proposal.id, revision: proposal.revision, candidates });
  return previous?.signature === signature ? previous : { signature, key: createKey(), proposalId: proposal.id, revision: proposal.revision, candidates };
}

export function mergeCoachSessions(primary: CoachSession[], fallback: CoachSession[]): CoachSession[] {
  return [...new Map([...fallback, ...primary].filter(session => session.id && session.date).map(session => [session.id, session])).values()];
}

/** Kept only in component memory: never persist message or image bytes in storage. */
export type CoachSendBody = {
  message: string;
  source: "text" | "voice";
  externalConsent: boolean;
  aiReplyMemoryConsent?:boolean;
  textProviderConsent?: "deepseek";
  imageConsent?: boolean;
  imageProviderConsent?: "openai";
  imageSource?: "manual_note" | "device" | "imported" | "unknown";
  image?: { mimeType: "image/png" | "image/jpeg" | "image/webp"; dataBase64: string };
  sessionId?: string;
};
export type CoachSendAttempt = { signature: string; clientRequestId: string };
export function coachSendAttempt(previous: CoachSendAttempt | null, body: CoachSendBody, createId: () => string): CoachSendAttempt {
  // An explicit sequence is stable across object property insertion order. Include
  // every provider-affecting field so changed consent can never reuse a paid claim.
  const signature = JSON.stringify([body.message, body.source, body.sessionId ?? null, body.externalConsent, body.aiReplyMemoryConsent === true, body.textProviderConsent ?? null, body.imageConsent === true, body.imageProviderConsent ?? null, body.imageSource ?? null, body.image?.mimeType ?? null, body.image?.dataBase64 ?? null]);
  return previous?.signature === signature ? previous : { signature, clientRequestId: createId() };
}
export function coachSendWasRecorded(attempt: CoachSendAttempt | null, messages: CoachMessage[]): boolean {
  return !!attempt && messages.some(message => message.role === "user" && message.clientRequestId === attempt.clientRequestId);
}
export function coachPendingActions(payload: CoachPayload): string[] {
  return Array.isArray(payload.pendingActions) ? [...new Set(payload.pendingActions.filter(action => action === "review_checkin" || action === "review_plan"))] : [];
}
