import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { RaceExecutionSplits } from '../components/race-execution-splits';
import type { ScenarioLegResult } from './race-scenario';
const leg: ScenarioLegResult = { id: 'run', sport: 'run', durationSeconds: 330.6, paceSecondsPerKm: 300, powerW: null, actualAveragePowerW: null, runPowerTargetW: null, hrTargetBpm: null, mechanicalWorkKj: null, metabolicKcal: null, missingInputs: [], warnings: [], segments: [{ index: 0, distanceM: 1100, durationSeconds: 330.6, grade: 0, speedMps: 1100 / 330.6, paceSecondsPerKm: 300.545, actualPowerW: null, mechanicalWorkKj: null }] };
test('execution UI uses disclosure, labeled selector, non-submit download and honest English copy', () => {
  const html = renderToStaticMarkup(createElement(RaceExecutionSplits, { leg, es: false }));
  assert.match(html, /<details/);
  assert.match(html, /<label for=/);
  assert.match(html, /<button type="button"/);
  assert.match(html, /not a prediction/);
  assert.match(html, /transitions and stops are not included/);
  assert.match(html, /0:05:31/);
  assert.match(html, /role="region"/);
});
test('Spanish labels and missing result are handled', () => {
  const html = renderToStaticMarkup(createElement(RaceExecutionSplits, { leg, es: true }));
  assert.match(html, /Descargar CSV/);
  assert.match(html, /no una predicción/);
  assert.equal(renderToStaticMarkup(createElement(RaceExecutionSplits, { leg: { ...leg, durationSeconds: null }, es: false })), '');
});
