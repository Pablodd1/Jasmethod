import assert from "node:assert/strict";
import { test } from "node:test";
import { buildCoachReply, type CoachReplyContext } from "./coach-conversation";
import { COACH_REFERRALS, coachReferral } from "./coach-referrals";

test("ordinary bilingual in-app coaching requests never become phone referrals", () => {
  for (const message of [
    "I need guidance on today’s workout",
    "I want coaching guidance",
    "I need to talk to my coach about today's workout",
    "I want to speak to a coach",
    "I cannot talk to J coach in JMM",
    "Contact J coach in the app",
    "Coach, I want to know why my training cards do not load",
    "I need help with my VO2max workout",
    "Where can I do my VO2max workout?",
    "Can you schedule my VO2max intervals?",
    "I read a book about RMR testing",
    "Explain my schedule for VO2max training",
    "How can I contact support about the coaching feature?",
    "Necesito orientación sobre mi entrenamiento de hoy",
    "Quiero hablar con mi entrenador sobre mi sesión",
    "Quiero asesoría para mi entrenamiento",
    "Necesito hablar con el coach virtual",
    "Explain the RMR test",
    "What does the VO₂max test measure?",
    "Where do I see my VO2max test results?",
    "Where can I get my VO2max test results?",
    "Explícame la prueba de RMR",
    "¿Qué mide la prueba de VO₂max?",
    "¿Dónde veo mis resultados de la prueba de VO2max?",
    "¿Dónde puedo hacer mi entrenamiento de VO2max?",
    "Quiero programar mis intervalos de VO2max",
  ]) assert.equal(coachReferral(message), null, message);
});

test("negated contact or testing requests stay in the in-app conversation", () => {
  for (const message of [
    "I don’t want to call Jasmel; explain my workout",
    "I do not need to contact a coach",
    "Don't give me Jasmel's phone number",
    "I don't want to book an RMR test",
    "I never want to call Eric about VO2max",
    "Explain my workout without telling me to call Jasmel",
    "Stop telling me to contact a coach",
    "Instead of calling someone, explain my VO2max test",
    "I need guidance but I don't want to call a coach",
    "No quiero llamar a Jasmel; explícame mi entrenamiento",
    "No necesito contactar a un entrenador",
    "No quiero reservar una prueba de VO₂max",
    "Explícame mi entrenamiento sin llamar a Jasmel",
    "Nunca quiero contactar a Jasmel",
    "Evita recomendar llamar a Jasmel",
  ]) assert.equal(coachReferral(message), null, message);
});

test("quoted and reported referral requests do not establish contact intent", () => {
  for (const message of [
    'The app says "call Jasmel" but I need workout guidance',
    "The reply was ‘call Jasmel’; explain my session instead",
    "The reply was 'call Jasmel'; explain my session instead",
    'Translate "Where can I do my VO2max test?"',
    "Translate ‘I don't want to call Jasmel’",
    "El mensaje dice «llamar a Jasmel», pero quiero mi entrenamiento",
    "Example: call Jasmel",
    "The coach told me to call Eric for an RMR test",
    "Why are you telling me to call Jasmel?",
    "The app recommends that I call Jasmel",
    "¿Por qué me dices que debo llamar a Jasmel?",
    "What does call a coach mean?",
    "`Call Jasmel` keeps appearing instead of my training",
    "> Call Jasmel\nI need my workout",
    'The message says "call Jasmel',
  ]) assert.equal(coachReferral(message), null, message);
});

test("explicit owner coaching contact and hiring requests preserve both languages", () => {
  const messages = [
    "How can I call Jasmel?",
    "I want to contact a coach",
    "I need to hire a personal coach",
    "I want to speak to a human coach",
    "I want to talk to Jasmel",
    "How can I contact Jasmel about my RMR test?",
    "What is Jasmel's phone number?",
    "Give me the phone number for Jasmel",
    "I need coaching guidance. Who can I call?",
    "Book a coaching consultation with Jasmel",
    "¿Cómo puedo contactar con Jasmel?",
    "Quiero llamar a un entrenador",
    "Quiero contratar un entrenador personal",
    "Quiero hablar con un entrenador humano",
    "Dame el número de teléfono de Jasmel",
    "Necesito orientación de un entrenador. ¿A quién llamar?",
    "Quiero reservar una cita con Jasmel",
  ];
  for (const language of ["en", "es"]) {
    for (const message of messages) {
      const result = coachReferral(message, language);
      assert.equal(result?.ruleId, "coach-conversation-v1:coaching-referral", message);
      assert.ok(result?.answer.includes(COACH_REFERRALS.coaching.phone), message);
      assert.match(result.answer, language === "es" ? /Confirma disponibilidad/ : /Confirm availability/);
    }
  }
});

test("explicit testing location, booking and provider contact requests preserve owner referrals", () => {
  const messages = [
    "Where can I do my VO2max test?",
    "Where can I get my RMR measured?",
    "Who offers VO₂max testing?",
    "I want to book an RMR test",
    "Schedule a VO2max assessment",
    "I need an RMR assessment. Who can I call?",
    "How can I contact Eric for testing?",
    "What's Eric's phone number?",
    "¿Dónde puedo hacer mi prueba de VO₂max?",
    "¿Quién realiza pruebas de RMR?",
    "Quiero reservar una prueba de RMR",
    "Necesito agendar una prueba de VO2max",
    "Quiero llamar a Eric",
    "Dame el número de teléfono de Eric",
  ];
  for (const language of ["en", "es"]) {
    for (const message of messages) {
      const result = coachReferral(message, language);
      assert.equal(result?.ruleId, "coach-conversation-v1:testing-referral", message);
      assert.ok(result?.answer.includes(COACH_REFERRALS.testing.phone), message);
      assert.match(result.answer, /Eric/);
      assert.match(result.answer, /Jasmel/);
      assert.match(result.answer, language === "es" ? /Confirma disponibilidad, precio/ : /Confirm availability, price/);
    }
  }
});

test("separate affirmative intent can follow a negated or quoted request", () => {
  assert.equal(coachReferral("I don't want to call Jasmel. Where can I get an RMR test?")?.ruleId, "coach-conversation-v1:testing-referral");
  assert.equal(coachReferral('The app said "call Eric". How can I contact Jasmel?')?.ruleId, "coach-conversation-v1:coaching-referral");
  assert.equal(coachReferral("No quiero reservar una prueba de VO2max. Dame el teléfono de Jasmel")?.ruleId, "coach-conversation-v1:coaching-referral");
});

test("conversation routing keeps workout help in-app and preserves safety before referrals", () => {
  const context: CoachReplyContext = { localToday: "2026-10-14", setupReady: true };
  for (const message of [
    "I need guidance on today’s workout",
    "I don’t want to call Jasmel; explain my workout",
    "Necesito orientación sobre mi entrenamiento de hoy",
    "No quiero llamar a Jasmel; explícame mi entrenamiento",
  ]) {
    const result = buildCoachReply(message, context);
    assert.doesNotMatch(result.ruleId, /referral$/, message);
    assert.doesNotMatch(result.answer, /7869708366|7862317906/, message);
  }
  const urgent = buildCoachReply("I have chest pain. Where can I do my VO2max test?", context);
  assert.match(urgent.ruleId, /urgent/);
  assert.doesNotMatch(urgent.answer, /7869708366|7862317906/);
});
