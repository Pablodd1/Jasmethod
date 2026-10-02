import test from "node:test";
import assert from "node:assert/strict";
import { Decoder, Stream } from "@garmin/fitsdk";
import { dayBounds, localDate, dateKey, busyHours } from "./dates";
import { prescribeToday } from "./adaptive";
import { buildFitWorkout, workoutToFitSpec } from "./fit-export";
import { computePmc, estimateTss } from "./fitness";
import { verifyWhoopWebhook } from "./webhook-auth";
import { createHmac } from "crypto";
import { coachingSummary } from "./coaching";
test("partial sessions retain actual work without counting as a fully fulfilled plan",()=>{const now=new Date("2026-09-06T16:00Z");const summary=coachingSummary([{date:now,completed:true,planned:true,feedbackStatus:"partial",durationMin:60,actualDurationMin:25,rpe:5}],[],{},"UTC",now);assert.equal(summary.minutes,25);assert.equal(summary.completed,1);assert.equal(summary.fulfillmentPct,0)});
import {
  parseAppleHealth,
  googleCalGetEvents,
  googleCalUpsertEvent,
  stravaGetActivities,
  ouraGetDaily,
  whoopGetDaily,
} from "./importers";
const base = {
  sport: "bike",
  title: "Bici 🏁 — Umbral",
  type: "threshold",
  intensity: "z4",
  durationMin: 60,
};
test("webhook signatures reject altered bodies, expired timestamps and missing keys", () => {
  const raw = '{"user_id":1}',
    now = Date.now(),
    stamp = String(now),
    signature = createHmac("sha256", "test-key")
      .update(stamp + raw)
      .digest("base64");
  assert.ok(verifyWhoopWebhook(raw, stamp, signature, "test-key", now));
  assert.equal(
    verifyWhoopWebhook(raw + " ", stamp, signature, "test-key", now),
    false,
  );
  assert.equal(
    verifyWhoopWebhook(raw, stamp, signature, "test-key", now + 600000),
    false,
  );
  assert.equal(
    verifyWhoopWebhook(raw, stamp, signature, undefined, now),
    false,
  );
});
test("DST boundaries and overlapping ISO calendar commitments", () => {
  for (const [key, hours] of [
    ["2026-03-08", 23],
    ["2026-11-01", 25],
  ] as const) {
    const day = dayBounds(
      "America/New_York",
      localDate(key, "America/New_York"),
    );
    assert.equal((day.end.getTime() - day.start.getTime()) / 3600000, hours);
    assert.equal(day.key, key);
  }
  assert.equal(
    dateKey(new Date("2026-09-07T02:00Z"), "America/New_York"),
    "2026-09-06",
  );
  assert.equal(
    busyHours(
      [
        {
          startTime: "2026-09-06T09:00:00-04:00",
          endTime: "2026-09-06T12:00:00-04:00",
        },
        { startTime: "11:00", endTime: "14:00" },
      ],
      "2026-09-06",
      "America/New_York",
    ),
    5,
  );
  assert.throws(() => localDate("2026-02-30", "America/New_York"));
});
test("prescription and rest use exact durations and safe intensity caps", () => {
  for (const duration of [1, 20, 37, 60, 123])
    for (const verdict of ["full", "trim", "easy", "rest"]) {
      const p = prescribeToday({
        session: { ...base, durationMin: duration },
        adaptation: {
          verdict,
          durationFactor: verdict === "rest" ? 0 : 0.6,
          intensityCap: "z2",
        },
      });
      assert.equal(
        p.steps.reduce((n, s) => n + s.seconds, 0),
        p.durationMin * 60,
      );
      assert.ok(p.steps.every((s) => Number(s.zone.slice(1)) <= 2));
      if (verdict === "rest") {
        assert.equal(p.durationMin, 0);
        assert.deepEqual(p.steps, []);
        assert.equal(p.targets.rpe, 0);
      }
    }
});
test("Garmin SDK independently decodes FIT CRC, Unicode, duration and power targets", () => {
  const p = prescribeToday({
    session: base,
    adaptation: { verdict: "trim", durationFactor: 0.6, intensityCap: "z2" },
  });
  const fit = buildFitWorkout(
    workoutToFitSpec({ ...base, ftp: 200, prescription: JSON.stringify(p) }),
  );
  const d = new Decoder(Stream.fromByteArray(fit));
  assert.equal(d.checkIntegrity(), true);
  const { messages, errors } = d.read();
  assert.deepEqual(errors, []);
  const m: any = messages;
  assert.match(m.workoutMesgs[0].wktName, /^JMM-[a-f0-9]{10} Bici 🏁 — Umbral$/);
  assert.equal(m.workoutStepMesgs.length, p.steps.length);
  assert.equal(
    m.workoutStepMesgs.reduce((n: number, s: any) => n + s.durationTime, 0),
    p.durationMin * 60,
  );
  assert.equal(m.workoutStepMesgs[1].customTargetValueHigh, 1150);
  assert.throws(() =>
    buildFitWorkout(workoutToFitSpec({ ...base, durationMin: 0 })),
  );
});
test("load decays across days without records, ignores future records and preserves explicit zero", () => {
  assert.equal(estimateTss({ durationMin: 90, tss: 0 }), 0);
  const w = {
    date: new Date("2026-09-01T16:00Z"),
    tssInput: { durationMin: 60, tss: 100 },
  };
  const now = new Date("2026-09-06T16:00Z"),
    p = computePmc([w], now, "UTC")!;
  assert.equal(p.series.length, 6);
  assert.ok(p.current.atl < p.series[0].atl);
  assert.deepEqual(
    computePmc([w, { ...w, date: new Date("2027-01-01T16:00Z") }], now, "UTC"),
    p,
  );
});
test("Apple XML supports nested workouts, native units, resting HR and SDNN records", () => {
  const xml = `<HealthData><Record type="HKQuantityTypeIdentifierHeartRate" value="170" startDate="2026-09-06 10:00:00 -0400"/><Record type="HKQuantityTypeIdentifierRestingHeartRate" value="52" startDate="2026-09-06 08:00:00 -0400"/><Record type="HKQuantityTypeIdentifierHeartRateVariabilitySDNN" value="42" startDate="2026-09-06 08:00:00 -0400"/><Workout workoutActivityType="HKWorkoutActivityTypeRunning" duration="30" durationUnit="min" startDate="2026-09-06 10:00:00 -0400" endDate="2026-09-06 10:30:00 -0400"><WorkoutStatistics type="HKQuantityTypeIdentifierDistanceWalkingRunning" sum="3.1" unit="mi"/></Workout></HealthData>`;
  const a = parseAppleHealth(xml);
  assert.equal(a.workouts.length, 1);
  assert.equal(a.workouts[0].durationMin, 30);
  assert.ok(Math.abs(a.workouts[0].distanceKm! - 4.989) < 0.01);
  assert.equal(a.hrLogs.length, 1);
  assert.equal(a.hrLogs[0].bpm, 52);
  assert.equal(a.hrvLogs[0].ms, 42);
});
async function mocked(
  handler: (url: string, init?: RequestInit) => Response | Promise<Response>,
  run: () => Promise<void>,
) {
  const original = globalThis.fetch;
  globalThis.fetch = (async (u: any, i: any) =>
    handler(String(u), i)) as typeof fetch;
  try {
    await run();
  } finally {
    globalThis.fetch = original;
  }
}
test("provider pagination collects later pages and calendar publishing retains workout identity", async () => {
  const urls: string[] = [];
  let posts = 0;
  await mocked(
    (url, init) => {
      urls.push(url);
      const u = new URL(url);
      if (u.hostname.includes("strava"))
        return Response.json(
          u.searchParams.get("page") === "1"
            ? [{ id: 1 }, { id: 2 }]
            : [{ id: 3 }],
        );
      if (init?.method === "PATCH") return new Response(null, { status: 404 });
      if (init?.method === "POST") {
        posts++;
        const b = JSON.parse(String(init.body));
        assert.match(b.id, /^[0-9a-f]{64}$/);
        return Response.json({ id: b.id });
      }
      return Response.json(
        u.searchParams.get("pageToken")
          ? { items: [{ id: "second" }] }
          : { items: [{ id: "first" }], nextPageToken: "next" },
      );
    },
    async () => {
      assert.equal((await stravaGetActivities("test", undefined, 2)).length, 3);
      assert.equal((await googleCalGetEvents("test")).length, 2);
      const e = {
        summary: "First title",
        start: new Date(),
        durationMin: 60,
        workoutId: "stable-workout",
      };
      assert.equal(
        await googleCalUpsertEvent("test", e),
        await googleCalUpsertEvent("test", { ...e, summary: "Changed title" }),
      );
      assert.equal(posts, 2);
    },
  );
});
test("Oura uses documented daily endpoints and Whoop joins recovery by sleep ID", async () => {
  await mocked(
    (url) => {
      const path = new URL(url).pathname;
      if (path.endsWith("daily_readiness"))
        return Response.json({ data: [{ day: "2026-09-06", score: 81 }] });
      if (path.endsWith("daily_sleep"))
        return Response.json({ data: [{ day: "2026-09-06", score: 85 }] });
      if (path.includes("ouraring")) return Response.json({ data: [] });
      if (new URL(url).hostname.includes("ouraring"))
        return Response.json({
          data: [
            {
              day: "2026-09-06",
              average_hrv: 50,
              lowest_heart_rate: 48,
              total_sleep_duration: 25200,
              type: "long_sleep",
            },
          ],
        });
      if (path.endsWith("recovery"))
        return Response.json({
          records: [
            {
              sleep_id: "sleep-1",
              created_at: "2026-09-07T00:00Z",
              score: {
                hrv_rmssd_milli: 55,
                resting_heart_rate: 49,
                recovery_score: 82,
              },
            },
          ],
        });
      return Response.json({
        records: [
          {
            id: "sleep-1",
            end: "2026-09-06T12:00Z",
            score: {
              stage_summary: {
                total_light_sleep_time_milli: 14400000,
                total_slow_wave_sleep_time_milli: 3600000,
                total_rem_sleep_time_milli: 7200000,
                total_in_bed_time_milli: 36000000,
              },
            },
          },
        ],
      });
    },
    async () => {
      const o = (await ouraGetDaily("test"))[0];
      assert.equal(o.hrv, 50);
      assert.equal(o.sleepHours, 7);
      assert.equal(o.readiness, 81);
      const w = (await whoopGetDaily("test"))[0];
      assert.equal(w.date, "2026-09-06");
      assert.equal(w.sleepHours, 7);
      assert.equal(w.hrv, 55);
    },
  );
});
