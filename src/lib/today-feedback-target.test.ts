import { test } from 'node:test';
import assert from 'node:assert/strict';
import { todayFeedbackTarget } from './today-feedback-target';

test('result entry resolves an explicit matched activity and refuses to guess', () => {
  const plan = { id: 'planned', matchedPlanId: 'actual' };
  assert.deepEqual(todayFeedbackTarget(plan, [{ id: 'actual' }, plan]), { kind: 'record', id: 'actual' });
  assert.deepEqual(todayFeedbackTarget(plan, [{ id: 'other' }]), { kind: 'choose' });
  assert.deepEqual(todayFeedbackTarget(plan, []), { kind: 'none' });
  assert.deepEqual(todayFeedbackTarget({ id: 'planned' }, [{ id: 'actual' }]), { kind: 'choose' });
  assert.deepEqual(todayFeedbackTarget({ id: 'planned' }, []), { kind: 'session', id: 'planned' });
  assert.deepEqual(todayFeedbackTarget(null, []), { kind: 'none' });
});
