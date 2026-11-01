import assert from "node:assert/strict";
import test from "node:test";
import { coachReviewArea, opensTodayWorkout } from "./coach-chat-intent";
test("today review understands English and Spanish without routing historical requests to today", () => {
  for (const text of ["Help me with today's workout", "What should I eat today?", "Revisa mi sesión de hoy", "Ayúdame con la alimentación de hoy", "hidratación hoy"]) assert.equal(opensTodayWorkout(text), true, text);
  for (const text of ["Review yesterday's workout", "Tomorrow's training", "Compare today and yesterday", "Mi entrenamiento de mañana", "What is FTP?", "My weight is 80 kg"]) assert.equal(opensTodayWorkout(text), false, text);
});

test("explicit personal review requests open the matching protected tool without guessing a record", () => {
  const cases = [
    ["Show my profile", "profile"], ["Revisa mi disponibilidad", "profile"],
    ["Review my training history", "history"], ["Muestra mis sesiones anteriores", "history"],
    ["Create my 8 week plan starting 2026-11-02", "plan"], ["Revisa mi ciclo", "plan"],
    ["Review my next race and venue", "race"], ["Revisa mi carrera", "race"],
    ["Show my workout", "session"], ["Revisa esta sesión", "session"],
  ] as const;
  for (const [message, area] of cases) assert.equal(coachReviewArea(message), area, message);
  for (const message of ["What is periodization?", "How do race transitions work?", "What is threshold power?", "My weight is 70 kg", "Do not open my profile", "No quiero revisar mi plan"]) assert.equal(coachReviewArea(message), null, message);
});
