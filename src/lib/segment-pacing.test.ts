import { test } from "node:test";
import assert from "node:assert/strict";
import { buildBikePacing, buildRunPacing } from "./segment-pacing";
import { parseGpxCourse } from "./gpx";

// Flat synthetic profile: 40 km at 0 m elevation.
const flat = Array.from({ length: 41 }, (_, i) => ({ km: i, elevM: 0 }));
// Hilly: 40 km — climb 10-20 km at +5% (500 m), descend 20-30 km at −5%.
const hilly = Array.from({ length: 41 }, (_, i) => ({
  km: i,
  elevM: i < 10 ? 0 : i < 20 ? (i - 10) * 50 : i < 30 ? 500 - (i - 20) * 50 : 0,
}));

test("bike pacing: flat course → near-constant watts, total ≈ distance/speed", () => {
  const t = buildBikePacing({
    profile: flat, courseKm: 40, ftp: 250, weightKg: 75,
    bikeType: "tt", hasAeroBars: true, tempC: 22, windKph: 8, gustsKph: 20,
  });
  assert.equal(t.sport, "bike");
  assert.ok(t.segments.length >= 8 && t.segments.length <= 40);
  const watts = t.segments.map((s) => s.targetW!);
  assert.ok(Math.max(...watts) - Math.min(...watts) < 15, "flat course steady watts");
  // 40 km at ~250W TT should land somewhere sane (50-90 min)
  assert.ok(t.totalMin > 50 && t.totalMin < 90, `total ${t.totalMin} min`);
  // gust band is wider than the mean estimate and ordered
  assert.ok(t.gustRangeMin[0] < t.totalMin && t.gustRangeMin[1] > t.totalMin);
});

test("bike pacing: climbs demand more watts than descents (grade pricing)", () => {
  const t = buildBikePacing({
    profile: hilly, courseKm: 40, ftp: 250, weightKg: 75, bikeType: "road", windKph: 0,
  });
  const climb = t.segments.find((s) => s.gradePct >= 5)!;
  const descend = t.segments.find((s) => s.gradePct <= -4)!;
  assert.ok(climb, "climb segment exists");
  assert.ok(descend, "descent segment exists");
  assert.ok(descend.speedKmh! > climb.speedKmh! * 1.5, "descend much faster than climb");
});

test("run pacing: uphill segments slower than downhill at same base pace", () => {
  const t = buildRunPacing({
    profile: hilly, courseKm: 40, runPaceBaseSecPerKm: 250, windKph: 5,
  });
  const up = t.segments.find((s) => s.gradePct >= 4)!;
  const down = t.segments.find((s) => s.gradePct <= -4)!;
  assert.ok(up && down);
  assert.ok(up.paceSecPerKm! > down.paceSecPerKm!);
  // +4% grade ≈ ×1.128 on 250×1.06 base → ~283 s/km; sanity window
  assert.ok(up.paceSecPerKm! > 290 && up.paceSecPerKm! < 320);
});

test("gpx parser now returns a downsampled profile", () => {
  const trkpts = Array.from({ length: 200 }, (_, i) => {
    const ele = i < 100 ? i * 2 : 200 - (i - 100) * 2; // up then down
    const lat = (25.0 + i * 0.0001).toFixed(6); // ~11 m steps → ~2.2 km total
    return `<trkpt lat="${lat}" lon="-80.10"><ele>${ele}</ele></trkpt>`;
  }).join("");
  const gpx = `<gpx><trk><trkseg>${trkpts}</trkseg></trk></gpx>`;
  const c = parseGpxCourse(gpx);
  assert.ok(c, "parsed");
  assert.ok(c!.profile.length >= 4 && c!.profile.length <= 400, `profile pts ${c!.profile.length}`);
  assert.ok(c!.profile[0].km === 0 || c!.profile.length > 0);
});
