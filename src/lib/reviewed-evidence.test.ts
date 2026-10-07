import test from 'node:test';
import assert from 'node:assert/strict';
import { REVIEWED_CLAIMS, PROTOCOL_CLAIMS, reviewClaimIds, protocolEvidence } from './reviewed-evidence';
import { reviewProtocolAthlete } from './protocol-eligibility';
import { buildProtocol, PROTOCOL_VERSION } from './protocols';
import { reviewProtocolSchedule } from './protocol-scheduling';

test('source status and existence fail closed without granting numerical authority', () => {
  for (const id of Object.keys(PROTOCOL_CLAIMS)) {
    const p = protocolEvidence(id);
    assert.equal(p.status, 'eligible');
    assert.equal(p.doseOrigin, 'jmm_starting_template');
    assert.ok(p.claims.every(c => c.numericAuthority === 'principle_only'));
  }
  for (const id of ['', 'Unknown', '__proto__', 'constructor']) assert.equal(protocolEvidence(id).status, 'insufficient-data');
  const row = REVIEWED_CLAIMS[0];
  for (const status of ['needs_review', 'withdrawn', 'superseded'] as const)
    assert.equal(reviewClaimIds([row.id], [{ ...row, status }]).status, 'insufficient-data');
  assert.equal(reviewClaimIds([row.id], [{ ...row, verification: 'unverified' }]).status, 'insufficient-data');
});

test('expert teaching has explicit lineage and is never trial or numerical evidence', () => {
  const expert = REVIEWED_CLAIMS.filter(c => c.id.startsWith('galpin-') || c.id.startsWith('huberman-'));
  assert.ok(expert.length >= 3);
  assert.ok(expert.every(c => c.classification === 'expert_education' && c.numericAuthority === 'principle_only'));
  assert.match(expert.find(c => c.id === 'galpin-strength-framework')!.limitation, /not a required weekly frequency/);
});
const adult = { protocolId: 'aerobic-power' as const, birthYear: 1990, injured: false, experience: 'amateur', goal: '5k', now: new Date('2026-10-07') };
test('unknown adulthood, age boundary, missing goal and history cannot become eligibility', () => {
  assert.equal(reviewProtocolAthlete(adult).status, 'eligible');
  for (const birthYear of [undefined, null, NaN, 2008, 3000]) assert.equal(reviewProtocolAthlete({ ...adult, birthYear }).status, 'insufficient-data');
  assert.equal(reviewProtocolAthlete({ ...adult, birthYear: 2009 }).status, 'blocked');
  assert.equal(reviewProtocolAthlete({ ...adult, injured: true }).status, 'blocked');
  assert.equal(reviewProtocolAthlete({ ...adult, experience: undefined }).status, 'insufficient-data');
  assert.equal(reviewProtocolAthlete({ ...adult, goal: null }).status, 'insufficient-data');
  assert.equal(reviewProtocolAthlete({ ...adult, protocolId: 'speed', experience: 'beginner' }).status, 'blocked');
});
test('old protocol versions and nonfinite requested time cannot rebuild', () => {
  const spec = { id: 'aerobic-power' as const, sport: 'run' as const, level: 'advanced', minutes: 40, version: PROTOCOL_VERSION };
  assert.throws(() => buildProtocol({ ...spec, version: '2026-09-07' }), /needs review/);
  assert.throws(() => buildProtocol({ ...spec, minutes: NaN }, 40), /Invalid session time/);
  assert.equal(buildProtocol(spec).evidence.doseOrigin, 'jmm_starting_template');
});
test('same-day hard replacement never bypasses agreement and review gate', () => {
  const w = { id: 'a', sport: 'run', durationMin: 40, intensity: 'z5', date: new Date('2026-10-07T12:00Z') };
  const review = reviewProtocolSchedule({ selected: w, candidate: w, nearby: [{ ...w, id: 'b', sport: 'strength' }], timezone: 'UTC', level: 'advanced', protocolId: 'aerobic-power' });
  assert.ok(review.blocks.some(b => b.includes('athlete agreement')));
});
