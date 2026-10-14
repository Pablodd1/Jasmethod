import { test } from "node:test";
import assert from "node:assert/strict";
import { coachDictationError } from "./coach-dictation-client";

for (const es of [false, true]) {
  test(`dictation permission failures explain recovery without claiming a send (${es ? "ES" : "EN"})`, () => {
    for (const error of ["not-allowed", "service-not-allowed", "NotAllowedError", "SecurityError"]) {
      const message = coachDictationError(error, es);
      assert.match(message, es ? /permisos del micrófono/ : /microphone and speech-recognition permissions/);
      assert.match(message, es ? /Puedes escribir/ : /You can type/);
      assert.match(message, es ? /No se ha enviado nada/ : /Nothing was sent/);
    }
  });

  test(`dictation device, silence, network and unknown failures keep a text fallback (${es ? "ES" : "EN"})`, () => {
    for (const error of ["audio-capture", "no-speech", "network", "aborted", "unknown"] ) {
      const message = coachDictationError(error, es);
      assert.match(message, es ? /escrib/ : /type your message/);
      assert.match(message, es ? /No se ha enviado nada/ : /Nothing was sent/);
    }
    assert.match(coachDictationError("audio-capture", es), es ? /micrófono/ : /microphone/);
    assert.match(coachDictationError("no-speech", es), es ? /No se detectó voz/ : /No speech was detected/);
    assert.match(coachDictationError("network", es), es ? /no pudo conectarse/ : /could not connect/);
    assert.doesNotMatch(coachDictationError("private browser diagnostic", es), /private browser diagnostic/);
  });
}
