// Smoke test: forecastRace runtime sanity across all sports
import { forecastRace } from "../src/lib/raceforecast";

const cases: any[] = [
  { distance: "5k" },
  { distance: "half-marathon" },
  { distance: "40k" },
  { distance: "sprint" },
  { distance: "hyrox" },
];

let fail = 0;
for (const c of cases) {
  const r = forecastRace({
    athlete: { ftp: 250, runPaceBase: 300, swimPaceBase: 100, weightKg: 75 },
    fitness: null,
    distance: c.distance,
    venue: {},
  });
  if (!r) {
    console.error(`FAIL: ${c.distance} -> null`);
    fail++;
    continue;
  }
  if (typeof r.totalMin !== "number" || r.totalMin <= 0) {
    console.error(`FAIL: ${c.distance} totalMin=${r.totalMin}`);
    fail++;
    continue;
  }
  console.log(
    `OK ${c.distance}: total=${r.totalMin}min conf=${r.confidence} label=${r.distanceLabel}`
  );
}

process.exit(fail ? 1 : 0);
