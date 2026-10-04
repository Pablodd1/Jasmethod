import { test } from "node:test";
import assert from "node:assert/strict";
import { dayOffProtocol, dayOffProtocolText } from "./day-off";
import { dayOffProtocol as plannedDayOff } from "./adaptive";

test("recovery movement requires explicit clearance; unknown and held days remain rest", () => {
  for (const lang of ["en", "es"] as const) {
    for (const options of [undefined, { allowMovement: false }]) {
      const p = dayOffProtocol(lang, options);
      const movement = p.essentials[0].detail;
      assert.match(movement, /No workout is prescribed|No hay ejercicio programado/);
      assert.doesNotMatch(movement, /20 min/);
      assert.match(movement, /safety check-in|check-in de seguridad/);
    }
    const p = dayOffProtocol(lang, { allowMovement: true });
    const movement = p.essentials[0].detail;
    assert.match(movement, /20 min/);
    assert.match(movement, /Z1/);
    assert.match(movement, /Complete rest is valid|descanso completo es válido/);
    assert.match(movement, /restrictions take priority|restricciones médicas tienen prioridad/);
    assert.match(movement, /Stop for pain|Detente ante dolor/);
    assert.match(movement, /familiar sport|deporte familiar/);
    assert.match(p.evidenceNote || "", /not a validated universal dose|no una dosis universal validada/);
  }
});

test("recovery guide covers life demands without supplements, forced breathing or outcome promises", () => {
  for (const lang of ["en", "es"] as const) {
    const p = dayOffProtocol(lang);
    const all = JSON.stringify(p);
    for (const pattern of [/sleep|sueño/i, /family|familiar/i, /work|laboral/i, /meditation|meditación/i, /alcohol/i, /recreational drugs|drogas recreativas/i, /No supplements|No se recomiendan suplementos/]) assert.match(all, pattern);
    assert.doesNotMatch(all, /pushing through fatigue|superando la fatiga|strengthens the neural|Refuerza las conexiones|8 hours|8 horas/);
    assert.match(all, /No breath holds|Sin retenciones/);
    assert.equal(p.visualizationFull.length, 8);
    assert.ok(p.sources?.every(source => source.url.startsWith("https://pubmed.ncbi.nlm.nih.gov/")));
    assert.match(dayOffProtocolText(lang), /complete rest|descanso completo/i);
  }
});

test("planned recovery remains zero workout minutes with the shared conservative guidance", () => {
  const p = plannedDayOff(new Date("2026-10-05T12:00Z"));
  assert.equal(p.minutes, 0);
  assert.equal(p.description, dayOffProtocolText("en"));
  assert.doesNotMatch(p.description, /20 min very easy/);
});
