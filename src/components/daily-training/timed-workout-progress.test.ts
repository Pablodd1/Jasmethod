import test from "node:test";
import assert from "node:assert/strict";
import { timedWorkoutProgress } from "./timed-workout-progress";

const steps = [{ seconds: 10 }, { seconds: 20 }, { seconds: 5 }];

test("the exact transition shows the next step, with its full remaining time", () => {
  assert.deepEqual(timedWorkoutProgress(steps, 9.75), { index: 0, elapsed: 9.75, remaining: 1, complete: false });
  assert.deepEqual(timedWorkoutProgress(steps, 10), { index: 1, elapsed: 10, remaining: 20, complete: false });
  assert.deepEqual(timedWorkoutProgress(steps, 30), { index: 2, elapsed: 30, remaining: 5, complete: false });
});

test("completion stays on the final step and reset returns to the first", () => {
  assert.deepEqual(timedWorkoutProgress(steps, 35.24), { index: 2, elapsed: 35, remaining: 0, complete: true });
  assert.deepEqual(timedWorkoutProgress(steps, 0), { index: 0, elapsed: 0, remaining: 10, complete: false });
});
