import test from 'node:test';
import assert from 'node:assert/strict';
import { manualWorkoutCalendarPlaceholder } from './manual-workout-calendar';
test('calendar placeholders respect saved language and explicitly mark unavailable detailed guidance',()=>{
  const link='https://app.example.invalid/daily?sessionId=fixture';
  assert.match(manualWorkoutCalendarPlaceholder('es',true,link).summary,/Sesión/);
  for(const locale of ['fr','ht','ru']) {
    const result=manualWorkoutCalendarPlaceholder(locale,false,link);
    assert.ok(result.description.endsWith(link));
    assert.doesNotMatch(result.description,/Minimal training placeholder|g\/h|ml\/h/);
  }
  assert.match(manualWorkoutCalendarPlaceholder('de',false,link).description,/English fallback/);
});
