import test from 'node:test';
import assert from 'node:assert/strict';
import { importedTrainingReview, importedTrainingWindow, type ImportedTrainingRow } from './imported-training-review';
const now=new Date('2026-10-15T12:00:00Z');
const row=(id:string,date:string,source='strava',minutes:number|null=60,sport='run'):ImportedTrainingRow=>({id,userId:"synthetic-review",planned:false,completed:true,date:new Date(date),source,sport,durationMin:minutes,actualDurationMin:minutes});
const four=()=>['2026-09-15','2026-09-22','2026-09-29','2026-10-06'].map((day,i)=>row(String(i),day+'T07:00:00Z','garmin',60+i*30));
test('import review uses four full athlete-local calendar weeks and never counts partial current week or future work',()=>{
 assert.deepEqual(importedTrainingWindow('UTC',now),{startKey:'2026-09-14',endKey:'2026-10-12'});
 assert.deepEqual(importedTrainingWindow('America/New_York',new Date('2026-11-02T02:00:00Z')),{startKey:'2026-09-28',endKey:'2026-10-26'});
 assert.deepEqual(importedTrainingWindow('UTC',new Date('2026-11-02T02:00:00Z')),{startKey:'2026-10-05',endKey:'2026-11-02'});
 const review=importedTrainingReview([...four(),row('current','2026-10-14T07:00:00Z'),row('old','2026-09-13T07:00:00Z')],'UTC',now);
 assert.equal(review.rawRecordCount,4);assert.equal(review.weeks.length,4);assert.equal(review.recordedWeeklyAverageMinutes,105);assert.equal(review.requiresAthleteReview,true);assert.equal(review.weeks[0].recordedDays,1);assert.match(review.note,/unrecorded days.*unknown/);
});
test('same-sport cross-provider near-start records keep raw provenance and a possible-overlap minute range, never extra capacity',()=>{
 const records=[...four(),row('whoop-copy','2026-09-15T07:00:30Z','whoop',40)];const review=importedTrainingReview(records,'UTC',now);
 assert.equal(review.rawRecordCount,5);assert.equal(review.possibleOverlapGroups,1);assert.deepEqual(review.weeks[0].minutesRange,{minimum:60,maximum:100});assert.equal(review.recordedWeeklyAverageMinutes,null);assert.deepEqual(review.weeks[0].overlaps[0].records.map(r=>r.source),['garmin','whoop']);assert.equal(records.length,5);
 const separate=importedTrainingReview([...four(),row('later','2026-09-15T07:01:01Z','whoop',40),row('other-sport','2026-09-15T07:00:00Z','whoop',30,'bike')],'UTC',now);assert.equal(separate.possibleOverlapGroups,0);assert.equal(separate.weeks[0].minutesRange.minimum,130);
});
test('missing weeks/durations and truncated history remain unknown; zero never becomes a confirmed rest week',()=>{
 const empty=importedTrainingReview([],'UTC',now);assert.ok(empty.weeks.every(w=>w.minutesRange.minimum===null&&w.minutesRange.maximum===null));assert.equal(empty.recordedWeeklyAverageMinutes,null);
 const review=importedTrainingReview([...four(),row('unknown','2026-09-16T07:00:00Z','whoop',null),row('zero','2026-09-17T07:00:00Z','garmin',0)],'UTC',now);
 assert.equal(review.unknownDurationRecords,2);assert.equal(review.weeks[0].minutesRange.minimum,60);assert.equal(review.weeks[0].minutesRange.maximum,null);assert.equal(review.recordedWeeklyAverageMinutes,null);
 assert.equal(importedTrainingReview(four(),'UTC',now,true).recordedWeeklyAverageMinutes,null);
 assert.equal(importedTrainingReview(four().slice(1),'UTC',now).recordedWeeklyAverageMinutes,null);
});
test('possible copies crossing a calendar-week boundary still block a misleading average and preserve dates',()=>{
 const review=importedTrainingReview([...four(),row('sunday','2026-09-20T23:59:45Z','strava',50),row('monday','2026-09-21T00:00:15Z','whoop',55)],'UTC',now);
 assert.equal(review.possibleOverlapGroups,1);assert.equal(review.recordedWeeklyAverageMinutes,null);assert.equal(review.weeks[0].possibleOverlapGroups,1);assert.equal(review.weeks[1].possibleOverlapGroups,1);assert.deepEqual(review.weeks[0].overlaps[0].records.map(r=>r.startedAt),['2026-09-20T23:59:45.000Z','2026-09-21T00:00:15.000Z']);
});
