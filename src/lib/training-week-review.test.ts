import test from "node:test";
import assert from "node:assert/strict";
import { buildTrainingWeekReview, trainingWeekBounds } from "./training-week-review";
import { readTrainingWeekReview } from "./training-week-store";

const row = (id: string, date: string, patch: Record<string, any> = {}) => ({ id, userId: "owner", title: id, sport: "run", date, source: "manual", planned: false, completed: true, durationMin: 60, actualDurationMin: 20, ...patch });
const review = (rows: ReturnType<typeof row>[], truncated = false) => buildTrainingWeekReview(rows, "owner", "2026-10-21", "UTC", "active", [], truncated);

test("week boundaries use Monday through Sunday across months and DST", () => {
  assert.deepEqual(trainingWeekBounds("2026-11-01"), {start:"2026-10-26",end:"2026-11-01",until:"2026-11-02"});
  assert.equal(trainingWeekBounds("2026-11-02").start,"2026-11-02");
});
test("past actuals stay separate from the current cycle's upcoming planned work", () => {
  const result = review([row("past","2026-10-19"), row("today","2026-10-21"), row("next","2026-10-22",{planned:true,completed:false,actualDurationMin:null,durationMin:45,planDay:{planId:"active"}}), row("retired","2026-10-23",{planned:true,completed:false,planDay:{planId:"retired"}})]);
  assert.equal(result.past.minutes,20); assert.equal(result.past.sessions,1);
  assert.equal(result.ahead.minutes,45);assert.equal(result.ahead.next?.[0].title,"next");
  assert.equal(result.usage,"local_display_only");
});
test("missing reports, missing actual duration and truncated reads never become zero actual load", () => {
  assert.equal(review([]).past.minutes,null);
  assert.equal(review([row("planned-only","2026-10-19",{planned:true,completed:false,actualDurationMin:null})]).past.status,"unknown");
  assert.equal(review([row("unknown-minutes","2026-10-19",{planned:true,actualDurationMin:null})]).past.status,"review");
  assert.equal(review([row("past","2026-10-19")],true).ahead.minutes,null);
  assert.equal(buildTrainingWeekReview([],"owner","2026-10-21","UTC",null).ahead.minutes,null);
});
test("foreign, invalid-date and outside-week records cannot enter the week", () => {
  const result = review([row("foreign","2026-10-19",{userId:"other"}),row("old","2026-10-10"),row("invalid","invalid")]);
  assert.equal(result.past.minutes,null);assert.deepEqual(result.ahead.next,[]);
});
test("source restrictions and duplicate identifiers withhold derived totals", () => {
  for(const source of ["strava","unrecognized"]) assert.equal(review([row("restricted","2026-10-19",{source})]).past.status,"restricted");
  for(const source of ["strava","unrecognized"]) assert.equal(review([row("future-restricted","2026-10-22",{source,planned:true,completed:false,planDay:{planId:"active"}})]).ahead.minutes,null);
  const result = review([row("a","2026-10-19T08:00Z",{source:"garmin",externalId:"same"}),row("b","2026-10-19T08:00Z",{source:"garmin",externalId:"same"})]);
  assert.equal(result.past.status,"review");assert.equal(result.past.minutes,null);
});
test("local timezone determines whether a record happened before today", () => {
  const result=buildTrainingWeekReview([row("late","2026-10-21T02:00Z")],"owner","2026-10-21","America/New_York","active");
  assert.equal(result.past.minutes,20);
});
test("the optional week reader scopes owner and dates, holds foreign disclosure, and tolerates unavailable storage", async () => {
  let args:any;
  const db:any={workout:{findMany:async(value:any)=>{args=value;return [row("restricted","2026-10-19",{source:"strava"})];}}};
  assert.equal(await readTrainingWeekReview("coach","owner","2026-10-21","America/New_York","active",[],db),null);
  assert.equal(args.where.AND[0].userId,"owner");assert.equal(args.where.date.gte.toISOString(),"2026-10-19T04:00:00.000Z");assert.equal(args.take,501);
  assert.equal((await readTrainingWeekReview("owner","owner","2026-10-21","UTC","active",[],db))?.past.status,"restricted");
  db.workout.findMany=async()=>{throw Error("unavailable")};
  assert.equal(await readTrainingWeekReview("owner","owner","2026-10-21","UTC","active",[],db),null);
});
