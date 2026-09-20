// Debug PMC computation
import { computePmc, estimateTss } from "../src/lib/fitness";

const workouts = [];
for (let i = 0; i < 60; i++) {
  const d = new Date("2026-06-01T00:00:00Z"); d.setDate(d.getDate() + i);
  workouts.push({ date: d, tssInput: { durationMin: 60, rpe: 5 + (i % 3) } });
}
const pmc = computePmc(workouts);
console.log("series length:", pmc?.series?.length);
console.log("current ctl:", pmc?.current?.ctl);
console.log("current atl:", pmc?.current?.atl);
console.log("single TSS rpe 6, 60min:", estimateTss({ durationMin: 60, rpe: 6 }));
