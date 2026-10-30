import { test } from "node:test";
import assert from "node:assert/strict";
import { COACH_IMAGE_LIMIT, CoachRequestGate, editedCoachCandidate, mergeCoachSessions, validateCoachImage, verifiedCoachReceipt, type CoachCandidate, type CoachPayload } from "./coach-conversation-client";

const candidate: CoachCandidate = { id: "fact-one", kind: "workout_feedback", field: "actualDurationMin", value: 30, unit: "min", observedDate: "2026-10-03", source: "voice", evidence: "I ran for 30 minutes", sessionId: "session-one", status: "proposed" };
const payload: CoachPayload = { ok: true, receipt: { id: "receipt-one", proposalId: "proposal-one", confirmedAt: "2026-10-03T12:00:00Z", applied: [{ candidateId: "fact-one", kind: candidate.kind, field: candidate.field, value: 30, source: "voice", observedDate: "2026-10-03", sessionId: "session-one" }], pendingActions: [] } };

test("new requests abort and invalidate stale responses, including ignored aborts", () => {
  const gate = new CoachRequestGate();
  const first = gate.begin();
  const second = gate.begin();
  assert.equal(first.signal.aborted, true);
  assert.equal(first.current(), false);
  assert.equal(second.current(), true);
  gate.cancel();
  assert.equal(second.current(), false);
  assert.equal(second.signal.aborted, true);
});

test("a timeout invalidates a ticket without invalidating a later request", () => {
  const gate = new CoachRequestGate();
  const first = gate.begin(); first.abort();
  assert.equal(first.current(), false);
  const second = gate.begin(); first.abort();
  assert.equal(second.current(), true);
});

test("image picker permits only bounded nonempty PNG, JPEG and WebP files", () => {
  for (const type of ["image/png", "image/jpeg", "image/webp"]) assert.equal(validateCoachImage({ type, size: COACH_IMAGE_LIMIT }), null);
  assert.equal(validateCoachImage({ type: "image/png", size: COACH_IMAGE_LIMIT + 1 }), "size");
  assert.equal(validateCoachImage({ type: "image/png", size: 0 }), "size");
  assert.equal(validateCoachImage({ type: "image/svg+xml", size: 100 }), "type");
  assert.equal(validateCoachImage({ type: "", size: 100 }), "type");
});

test("edited numeric values remain numbers while provenance and binding remain unchanged", () => {
  assert.deepEqual(editedCoachCandidate(candidate, " 42 "), { ...candidate, value: 42 });
  for (const invalid of ["", " ", "NaN", "Infinity", "thirty"]) assert.throws(() => editedCoachCandidate(candidate, invalid));
  assert.deepEqual(candidate.value, 30);
});

test("boolean review never coerces a nonempty false string to true", () => {
  const boolean: CoachCandidate = { ...candidate, kind: "checkin", field: "newPain", value: true, unit: null, sessionId: undefined };
  assert.equal(editedCoachCandidate(boolean, "false").value, false);
  assert.equal(editedCoachCandidate(boolean, "true").value, true);
  assert.throws(() => editedCoachCandidate(boolean, "yes"));
});

test("success labels require a well-formed receipt, not merely HTTP 200 or ok", () => {
  assert.equal(verifiedCoachReceipt({ ok: true }), null);
  assert.equal(verifiedCoachReceipt({ ...payload, ok: false }), null);
  assert.equal(verifiedCoachReceipt({ ...payload, receipt: { ...payload.receipt!, confirmedAt: "not a date" } }), null);
  assert.equal(verifiedCoachReceipt(payload, "other-proposal", [candidate]), null);
  assert.equal(verifiedCoachReceipt(payload, "proposal-one", [candidate])?.id, "receipt-one");
});

test("receipt cannot claim a different value, session or unselected fact was saved", () => {
  assert.equal(verifiedCoachReceipt(payload, "proposal-one", []), null);
  assert.equal(verifiedCoachReceipt(payload, "proposal-one", [{ ...candidate, value: 99 }]), null);
  assert.equal(verifiedCoachReceipt(payload, "proposal-one", [{ ...candidate, sessionId: "session-two" }]), null);
  assert.equal(verifiedCoachReceipt({ ...payload, receipt: { ...payload.receipt!, applied: [{ ...payload.receipt!.applied[0], kind: "checkin" }] } }), null);
});

test("pending check-in review has a receipt but no saved-fact claim", () => {
  const result = verifiedCoachReceipt({ ...payload, receipt: { ...payload.receipt!, applied: [], pendingActions: ["review_checkin"] } });
  assert.equal(result?.applied.length, 0);
  assert.deepEqual(result?.pendingActions, ["review_checkin"]);
});

test("session picker deduplicates by id and retains explicit dates", () => {
  const today = { id: "one", title: "Today", sport: "run", date: "2026-10-03" };
  const recent = { id: "two", title: "Yesterday", sport: "bike", date: "2026-10-02" };
  assert.deepEqual(mergeCoachSessions([{ ...today, title: "Canonical title" }, recent], [today]), [{ ...today, title: "Canonical title" }, recent]);
  assert.deepEqual(mergeCoachSessions([{ ...today, date: "" }], []), []);
});

test("a timed-out older ticket cannot release the lock of a newer operation", () => {
  const gate = new CoachRequestGate();
  const old = gate.begin(); old.abort();
  assert.equal(old.latest(), true);
  const current = gate.begin();
  assert.equal(old.latest(), false);
  assert.equal(current.latest(), true);
});

test("receipt verification rejects incomplete, duplicate and changed-provenance saves", () => {
  assert.equal(verifiedCoachReceipt({ ...payload, receipt: { ...payload.receipt!, applied: [] } }, "proposal-one", [candidate]), null);
  assert.equal(verifiedCoachReceipt({ ...payload, receipt: { ...payload.receipt!, applied: [...payload.receipt!.applied, ...payload.receipt!.applied] } }), null);
  assert.equal(verifiedCoachReceipt({ ...payload, applied: false }, "proposal-one", [candidate]), null);
  assert.equal(verifiedCoachReceipt(payload, "proposal-one", [{ ...candidate, source: "image" }]), null);
  assert.equal(verifiedCoachReceipt(payload, "proposal-one", [{ ...candidate, observedDate: "2026-10-02" }]), null);
});

import { coachConfirmationAttempt } from "./coach-conversation-client";
test("retries reuse the exact confirmation key; changed facts require a new review key", () => {
  const proposal = { id: "proposal-one", revision: 1 };
  const original = coachConfirmationAttempt(null, proposal, [candidate], () => "first-key");
  assert.equal(coachConfirmationAttempt(original, proposal, [candidate], () => "should-not-be-used"), original);
  assert.equal(coachConfirmationAttempt(original, proposal, [{ ...candidate, value: 40 }], () => "edited-key").key, "edited-key");
  assert.equal(coachConfirmationAttempt(original, { ...proposal, revision: 2 }, [candidate], () => "revised-key").key, "revised-key");
});

import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { CoachConversation, ProfileProposalComparison } from "./coach-conversation";
import { coachCandidateInput, coachCandidateUnit, coachDisplayValue } from "./coach-conversation-client";

test("profile before/after cards and edits use chosen units without rounding canonical values", () => {
  const weight: CoachCandidate = { ...candidate, kind: "profile", field: "weightKg", unit: "kg", value: 75, sessionId: undefined };
  const imperial = renderToStaticMarkup(React.createElement(ProfileProposalComparison, { candidate: weight, beforeValue: 70, afterValue: 75, units: "imperial", es: false }));
  assert.match(imperial, /Before/); assert.match(imperial, /After approval/);
  assert.match(imperial, /154\.3 lb/); assert.match(imperial, /165\.3 lb/); assert.doesNotMatch(imperial, /75 kg/);
  const metric = renderToStaticMarkup(React.createElement(ProfileProposalComparison, { candidate: weight, beforeValue: null, afterValue: 75, units: "metric", es: true }));
  assert.match(metric, /Antes/); assert.match(metric, /75\.0 kg/); assert.match(metric, /—/);
  assert.equal(editedCoachCandidate(weight, coachCandidateInput(weight, "imperial"), "imperial").value, 75);
  assert.ok(Math.abs(Number(editedCoachCandidate(weight, "165.3465", "imperial").value) - 75) < 0.001);
  const height = { ...weight, field: "heightCm", value: 172.72321, unit: "cm" };
  assert.equal(editedCoachCandidate(height, coachCandidateInput(height, "imperial"), "imperial").value, height.value);
  assert.equal(editedCoachCandidate(height, "5 ft 8 in", "imperial").value, 172.72);
  for (const raw of ["5", "5 ft 12 in", "5 ft -1 in", "NaN", "5 ft 8 in extra"]) assert.throws(() => editedCoachCandidate(height, raw, "imperial"));
  assert.match(coachDisplayValue("heightCm", 172.72, "cm", "imperial"), /5'8/);
  assert.equal(coachDisplayValue("ftp", 250, "W", "imperial"), "250 W");
  assert.equal(coachDisplayValue("weeklyHours", 6, "h/week", "metric"), "6 h/week");
});

test("an older verified receipt remains displayable after cancelling a later proposal", () => {
  assert.equal(verifiedCoachReceipt({ ...payload, applied: false, proposal: { id: "later-proposal", revision: 2, status: "cancelled", candidates: [] } })?.id, "receipt-one");
  assert.equal(verifiedCoachReceipt({ ...payload, applied: false, proposal: { id: "proposal-one", revision: 2, status: "confirmed", candidates: [] } }), null);
});

test("feedback before/after body weights edit and confirm in the same chosen units as receipts", () => {
  for (const field of ["preWeightKg", "postWeightKg"]) for (const units of ["metric", "imperial"] as const) {
    const feedback: CoachCandidate = { ...candidate, field, value: 70.123456, unit: "kg" };
    const input = coachCandidateInput(feedback, units);
    assert.equal(coachCandidateUnit(feedback, units), units === "imperial" ? "lb" : "kg");
    assert.equal(editedCoachCandidate(feedback, input, units).value, feedback.value, "Unchanged presentation preserves every canonical digit");
    assert.equal(Number(input) > 100, units === "imperial", "Pounds are displayed for imperial feedback inputs");
    const edited = editedCoachCandidate(feedback, units === "imperial" ? "176.3696" : "80", units);
    assert.ok(Math.abs(Number(edited.value) - 80) < 0.00001);
    assert.equal(edited.unit, "kg"); assert.equal(edited.sessionId, feedback.sessionId);
    assert.equal(coachDisplayValue(field, edited.value, "kg", units), units === "imperial" ? "176.4 lb" : "80.0 kg");
  }
});

test("check-in weight drafts use the same chosen-unit presentation without changing canonical kg", () => {
  const draft: CoachCandidate = { ...candidate, kind: "checkin", field: "weightKg", value: 70.123456, unit: "kg", sessionId: undefined };
  for (const units of ["metric", "imperial"] as const) {
    const input = coachCandidateInput(draft, units);
    assert.equal(Number(input) > 100, units === "imperial");
    assert.equal(coachCandidateUnit(draft, units), units === "imperial" ? "lb" : "kg");
    assert.equal(editedCoachCandidate(draft, input, units).value, draft.value);
    const edited = editedCoachCandidate(draft, units === "imperial" ? "176.3696" : "80", units);
    assert.ok(Math.abs(Number(edited.value) - 80) < 0.00001); assert.equal(edited.unit, "kg");
    assert.equal(coachDisplayValue(edited.field, edited.value, edited.unit, units), units === "imperial" ? "176.4 lb" : "80.0 kg");
  }
});
for (const es of [false, true]) test(`conversation first render is labeled, consent-off, and safe (${es ? "ES" : "EN"})`, () => {
  const markup = renderToStaticMarkup(React.createElement(CoachConversation, { es, athleteId: "test-athlete", onConfirmed: () => undefined }));
  assert.ok(markup.includes(`lang="${es ? "es" : "en"}"`));
  assert.ok(markup.includes('JMM Coach'));
  assert.ok(markup.includes(es ? "Historial de conversación" : "Conversation history"));
  assert.ok(markup.includes('type="file" accept="image/png,image/jpeg,image/webp"'));
  assert.equal(markup.includes('checked=""'), false);
  assert.ok(markup.includes(es ? "El análisis de imágenes no está configurado" : "Image analysis is not configured"));
  assert.ok(markup.includes(es ? "Tu mensaje" : "Your message"));
});

import { coachExternalPermissions } from "./coach-conversation-client";
import { coachTextStatusMessage } from "./coach-conversation-client";
test("OpenAI availability and local-policy messages never fabricate provider success or fallback", () => {
  assert.match(coachTextStatusMessage("unavailable",false)!, /OpenAI could not answer.*local reply.*no other text provider/);
  assert.match(coachTextStatusMessage("unavailable",true)!, /OpenAI no pudo responder/);
  assert.match(coachTextStatusMessage("not_configured",false)!, /not configured/);
  assert.match(coachTextStatusMessage("policy_local",false)!, /Answered within JMM/);
  assert.equal(coachTextStatusMessage("not_requested",false),null);
});
test("external providers each require matching named capability and independent explicit consent", () => {
  const configured = { externalAi: true, textProvider: "OpenAI", imageUnderstanding: true, imageProvider: "OpenAI" };
  assert.deepEqual(coachExternalPermissions(configured, false, false), { text: false, image: false });
  assert.deepEqual(coachExternalPermissions(configured, true, false), { text: true, image: false });
  assert.deepEqual(coachExternalPermissions(configured, false, true), { text: false, image: true });
  assert.deepEqual(coachExternalPermissions({ externalAi: true, imageUnderstanding: true }, true, true), { text: false, image: false });
  assert.deepEqual(coachExternalPermissions({ ...configured, textProvider: "Other", imageProvider: "Other" }, true, true), { text: false, image: false });
  assert.deepEqual(coachExternalPermissions({ imageUnderstanding: true, imageProvider: "OpenAI", externalAi: false }, false, true), { text: false, image: true });
});

test("malformed receipt bodies fail closed without crashing confirmation", () => {
  assert.equal(verifiedCoachReceipt({ ...payload, receipt: { ...payload.receipt!, applied: [null] } } as unknown as CoachPayload), null);
  assert.equal(verifiedCoachReceipt({ ...payload, receipt: { ...payload.receipt!, pendingActions: ["unknown_action"] } }), null);
  assert.equal(verifiedCoachReceipt({ ...payload, receipt: { ...payload.receipt!, applied: [{ ...payload.receipt!.applied[0], value: Number.NaN }] } }), null);
  assert.equal(validateCoachImage({ size: Number.NaN, type: "image/png" }), "size");
});

import { coachSendAttempt, coachSendWasRecorded, coachPendingActions, type CoachSendBody } from "./coach-conversation-client";
const paidBody: CoachSendBody = {
  message: "Explain RPE", source: "text", sessionId: "session-one", externalConsent: true, textProviderConsent: "openai", imageConsent: true, imageProviderConsent: "openai", image: { mimeType: "image/png", dataBase64: "bytes-one" },
};
test("all send retries reuse a stable client request id for the exact logical request", () => {
  const first = coachSendAttempt(null, paidBody, () => "send-one");
  assert.equal(coachSendAttempt(first, { ...paidBody }, () => "unused"), first);
  const reordered = Object.fromEntries(Object.entries(paidBody).reverse()) as CoachSendBody;
  assert.equal(coachSendAttempt(first, reordered, () => "unused"), first);
  const local = { message: "Today I ran", source: "text" as const, externalConsent: false };
  const localAttempt = coachSendAttempt(null, local, () => "local-one");
  assert.equal(coachSendAttempt(localAttempt, local, () => "unused").clientRequestId, "local-one");
});
test("changed message, source, session, consent, provider or image cannot reuse a paid request id", () => {
  const first = coachSendAttempt(null, paidBody, () => "send-one");
  const changes: Partial<CoachSendBody>[] = [
    { message: "Explain easy endurance" }, { source: "voice" }, { sessionId: "session-two" },
    { externalConsent: false }, { aiReplyMemoryConsent: true }, { textProviderConsent: undefined }, { imageConsent: false }, { imageProviderConsent: undefined },
    { image: undefined }, { image: { ...paidBody.image!, dataBase64: "different-bytes" } }, { image: { ...paidBody.image!, mimeType: "image/webp" } },
  ];
  for (const change of changes) assert.equal(coachSendAttempt(first, { ...paidBody, ...change }, () => "new-request").clientRequestId, "new-request");
});
test("reload recovery matches opaque request ids, never guessed message text", () => {
  const first = coachSendAttempt(null, paidBody, () => "send-one");
  const message = { id: "message-one", role: "user", content: paidBody.message, source: "text", createdAt: "2026-10-03T16:00:00Z" };
  assert.equal(coachSendWasRecorded(first, [message]), false);
  assert.equal(coachSendWasRecorded(first, [{ ...message, clientRequestId: "send-other" }]), false);
  assert.equal(coachSendWasRecorded(first, [{ ...message, clientRequestId: "send-one" }]), true);
  assert.equal(coachSendWasRecorded(first, [{ ...message, clientRequestId: "send-one", role: "assistant" }]), false);
});
test("safety next-step links do not need a proposal or saved receipt", () => {
  assert.deepEqual(coachPendingActions({ ok: true, pendingActions: ["review_checkin", "unexpected", "review_checkin"] }), ["review_checkin"]);
  assert.deepEqual(coachPendingActions({ ok: true }), []);
});

for (const es of [false, true]) test(`composer comes before optional workout/image/AI tools; privacy stays closed (${es ? "ES" : "EN"})`, () => {
  const markup = renderToStaticMarkup(React.createElement(CoachConversation, { es, athleteId: "test-athlete", onConfirmed: () => undefined }));
  const composer = markup.indexOf("<textarea");
  const send = markup.indexOf('type="submit"');
  const tools = markup.indexOf(es ? "Herramientas opcionales" : "Optional tools");
  const workout = markup.indexOf(es ? "Sesión sobre la que hablas" : "Workout you are discussing");
  const privacy = markup.indexOf(es ? "Privacidad y detalles" : "Privacy &amp; conversation");
  assert.ok(composer>=0&&composer<send);
  assert.ok(tools>=0&&tools<workout&&workout<composer);
  assert.ok(privacy>=0);
  assert.equal((markup.match(/<details/g) || []).length, 7);
  assert.match(markup,/tel:\+17862317906/);
  assert.match(markup,/tel:\+17869708366/);
  assert.doesNotMatch(markup, /<details[^>]*\bopen(?:=|>|\s)/);
  assert.ok(markup.includes("OpenAI"));assert.doesNotMatch(markup,/DeepSeek|Google Gemini/);
  assert.ok(markup.includes(es ? "Memoria externa de IA desactivada" : "External AI memory is disabled"));
  assert.ok(markup.includes(es ? "tema de una lista fija" : "allowlisted topic"));
  assert.ok(markup.includes(es ? "mientras esta página esté abierta" : "while this page is open"));
  assert.ok(markup.includes(es ? "requieren tu confirmación" : "need your confirmation"));
  assert.ok(markup.includes(es ? "Sí, borrar conversación" : "Yes, clear conversation") === false);
});

for (const es of [false, true]) test(`dictation is visible beside the composer, labeled, and never duplicated (${es ? "ES" : "EN"})`, () => {
  const markup = renderToStaticMarkup(React.createElement(CoachConversation, { es, athleteId: "test-athlete", onConfirmed: () => undefined }));
  const visibleComposer = markup.slice(markup.indexOf("<form"), markup.indexOf("<details",markup.indexOf('<form')));
  const startLabel = es ? "Micrófono" : "Microphone";
  assert.equal(markup.split(startLabel).length - 1, 1);
  assert.ok(visibleComposer.includes(startLabel));
  assert.ok(markup.includes(es ? "Dictar un mensaje" : "Dictate a message"));
  assert.ok(visibleComposer.includes(es ? "puede enviar audio al proveedor del navegador" : "may send audio to your browser’s provider"));
  assert.ok(markup.includes(es ? "nunca guarda datos ni envía tu mensaje automáticamente" : "never saves facts or sends your message automatically"));
  assert.match(visibleComposer, /<button[^>]*aria-describedby="[^"]+-dictation-help"[^>]*disabled=""/);
  assert.match(visibleComposer, /<textarea[^>]*!text-base[^>]*rows="2"/);
  assert.match(visibleComposer, /min-h-11 max-w-full whitespace-normal/);
  assert.doesNotMatch(markup, /live voice|voice call|voz en vivo/i);
  // Support is unknown until hydration; do not falsely label capable devices unsupported.
  assert.ok(!markup.includes(es ? "El dictado no está disponible" : "Dictation is unavailable"));
});
