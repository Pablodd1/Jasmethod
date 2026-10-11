import test from 'node:test';
import assert from 'node:assert/strict';
import { PROTOCOL_AUDIT } from './protocol-audit';
import { getProtocol, protocolCoachContext } from './protocols';
import { EVIDENCE_WORKOUTS } from './evidence-workouts';

test('audit identities are unique and only existing reviewed templates can be selected', () => {
  assert.equal(new Set(PROTOCOL_AUDIT.rows.map(r => r.id)).size, PROTOCOL_AUDIT.rows.length);
  for (const row of PROTOCOL_AUDIT.rows) {
    assert.ok(row.runtimeReason.length > 20);
    assert.ok(row.source_urls.every(url => url.startsWith('https://')));
    if (row.protocolId) {
      assert.ok(getProtocol(row.protocolId));
      assert.equal(row.runtimeStatus, 'adapted-template-available');
    } else assert.equal(row.runtimeStatus, 'not-selectable');
  }
});

test('coach retrieval contains provenance and adaptation limits for every new recipe', () => {
  const context = protocolCoachContext();
  for (const workout of EVIDENCE_WORKOUTS) {
    assert.ok(context.includes(workout.source.url));
    assert.ok(context.includes(workout.source.population));
    assert.ok(context.includes(workout.adaptation));
  }
  assert.match(context, /never an automatic default/);
});

test('general research lookup retains links and limits for newly executable study adaptations', async () => {
  const { sourcesFor } = await import('./research');
  for (const workout of EVIDENCE_WORKOUTS) {
    const sources = sourcesFor([`reviewed-${workout.id}`]);
    assert.equal(sources.length, 1);
    assert.ok(sources[0].ref.includes(workout.source.url));
    assert.match(sources[0].claim, /disclosed effort adaptations/);
  }
});

test('published audit counts distinguish studied main sets from all entries and frameworks', () => {
  assert.equal(PROTOCOL_AUDIT.rows.length, PROTOCOL_AUDIT.counts.audited_rows);
  assert.equal(PROTOCOL_AUDIT.rows.filter(r => r.has_source_verified_main_set).length, PROTOCOL_AUDIT.counts.source_verified_main_sets);
  assert.equal(PROTOCOL_AUDIT.rows.filter(r => r.is_training_session).length, PROTOCOL_AUDIT.counts.session_rows);
  assert.equal(PROTOCOL_AUDIT.counts.source_verified_main_sets, 30);
  assert.equal(PROTOCOL_AUDIT.counts.primary_study_families, 17);
  assert.equal(EVIDENCE_WORKOUTS.length, 3);
});

test('new recipe evidence fails closed when its reviewed claim is absent or withdrawn', async () => {
  const { REVIEWED_CLAIMS, protocolEvidence } = await import('./reviewed-evidence');
  for (const workout of EVIDENCE_WORKOUTS) {
    assert.equal(protocolEvidence(workout.id, []).status, 'insufficient-data');
    const row = REVIEWED_CLAIMS.find(c => c.id === workout.id)!;
    assert.equal(protocolEvidence(workout.id, [{ ...row, status: 'withdrawn' }]).status, 'insufficient-data');
    assert.equal(protocolEvidence(workout.id, [{ ...row, verification: 'unverified' }]).status, 'insufficient-data');
  }
});
