import assert from "node:assert/strict";
import test from "node:test";
import { coachReviewArea, isPostWorkoutRecoveryReport, opensTodayWorkout } from "./coach-chat-intent";

test("post-workout recovery reports open review without treating education as athlete data", () => {
  const reports = [
    "I finished a hard bike-run brick yesterday. My legs feel heavy and I slept poorly.",
    "Hard brick yesterday, heavy legs, poor sleep.",
    "Hice una sesión dura de bici y carrera ayer. Me pesan las piernas y dormí mal.",
  ];
  for (const text of reports) assert.equal(isPostWorkoutRecoveryReport(text), true, text);
  const nonReports = [
    "What should I do after a hard brick when I have heavy legs and poor sleep?",
    "What if I did a hard brick and I slept poorly?",
    "My athlete did a hard brick yesterday and says heavy legs and poor sleep.",
    "I didn't finish the hard brick. My legs feel heavy.",
    "I finished a hard brick last month and slept poorly.",
    "I finished a hard brick yesterday. I slept well.",
    "I finished a hard brick yesterday. No heavy legs or poor sleep.",
  ];
  for (const text of nonReports) assert.equal(isPostWorkoutRecoveryReport(text), false, text);
});
test("today review understands English and Spanish without routing historical requests to today", () => {
  for (const text of ["Help me with today's workout", "What should I eat today?", "Revisa mi sesión de hoy", "Ayúdame con la alimentación de hoy", "hidratación hoy", "Why so few minutes today?", "¿Por qué tan pocos minutos hoy?"]) assert.equal(opensTodayWorkout(text), true, text);
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
