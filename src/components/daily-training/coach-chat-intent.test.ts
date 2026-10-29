import assert from "node:assert/strict";
import test from "node:test";
import { opensTodayWorkout } from "./coach-chat-intent";
test("today review understands English and Spanish without routing historical requests to today", () => {
  for (const text of ["Help me with today's workout", "What should I eat today?", "Revisa mi sesión de hoy", "Ayúdame con la alimentación de hoy", "hidratación hoy"]) assert.equal(opensTodayWorkout(text), true, text);
  for (const text of ["Review yesterday's workout", "Tomorrow's training", "Compare today and yesterday", "Mi entrenamiento de mañana", "What is FTP?", "My weight is 80 kg"]) assert.equal(opensTodayWorkout(text), false, text);
});
