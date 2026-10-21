import test from "node:test";
import assert from "node:assert/strict";
import { applyIntervalPatch, durationSeconds, parseIntervalRequest, summarizeSet, type EditableStep } from "./workout-interval-edit";
import { normalizeSteps } from "./canonical-session";
import { parseWorkoutCardEdit } from "./workout-card-edit";

/** 10 min warm-up, N × (work, rest) set shaped like prescription.ts output, 10 min cool-down. */
function session(reps = 4, work = 240, rest = 120, zone = "z4", withGroup = true): EditableStep[] {
  const group = withGroup ? `Repeat ${reps} × ${work / 60} min — Threshold cruise intervals` : undefined;
  const steps: EditableStep[] = [{ name: "Warm up", seconds: 600, zone: "z1", phase: "warmup", endpoint: { type: "time", seconds: 600 } }];
  for (let i = 0; i < reps; i++) {
    steps.push({ name: `Hard ${i + 1}/${reps}`, seconds: work, zone, phase: "active", endpoint: { type: "time", seconds: work }, ...(group ? { group } : {}) });
    if (i < reps - 1) steps.push({ name: "Easy recovery", seconds: rest, zone: "z2", phase: "recovery", endpoint: { type: "time", seconds: rest }, ...(group ? { group } : {}) });
  }
  steps.push({ name: "Cool down", seconds: 600, zone: "z1", phase: "cooldown", endpoint: { type: "time", seconds: 600 } });
  return steps;
}
const BIG = { budgetSeconds: 3 * 3600, intensityCapZone: 5 };
const ok = (r: ReturnType<typeof applyIntervalPatch>) => { if (!r.ok) throw new Error(`refused: ${r.code} ${r.en}`); return r; };

test("durations parse in EN/ES and as m:ss; garbage is not a duration", () => {
  assert.equal(durationSeconds("4 min"), 240);
  assert.equal(durationSeconds("4 minutos"), 240);
  assert.equal(durationSeconds("90 s"), 90);
  assert.equal(durationSeconds("90 segundos"), 90);
  assert.equal(durationSeconds("1:30"), 90);
  assert.equal(durationSeconds("4,5 min"), 270);
  assert.equal(durationSeconds("1:75"), null);
  assert.equal(durationSeconds("soon"), null);
});

test("parser: EN requests map to the exact numbers said", () => {
  assert.deepEqual(parseIntervalRequest("make it 5 x 4 min with 2 min rest"), { ok: true, patch: { repeats: 5, workSeconds: 240, restSeconds: 120 } });
  assert.deepEqual(parseIntervalRequest("5×4 min, rest 90 seconds"), { ok: true, patch: { repeats: 5, workSeconds: 240, restSeconds: 90 } });
  assert.deepEqual(parseIntervalRequest("make it 6 intervals"), { ok: true, patch: { repeats: 6 } });
  assert.deepEqual(parseIntervalRequest("add one more interval"), { ok: true, patch: { repeatsDelta: 1 } });
  assert.deepEqual(parseIntervalRequest("add 2 more intervals"), { ok: true, patch: { repeatsDelta: 2 } });
  assert.deepEqual(parseIntervalRequest("one less interval"), { ok: true, patch: { repeatsDelta: -1 } });
  assert.deepEqual(parseIntervalRequest("remove 2 intervals"), { ok: true, patch: { repeatsDelta: -2 } });
  assert.deepEqual(parseIntervalRequest("intervals of 3 min"), { ok: true, patch: { workSeconds: 180 } });
  assert.deepEqual(parseIntervalRequest("make the recovery 2:30"), { ok: true, patch: { restSeconds: 150 } });
  assert.deepEqual(parseIntervalRequest("do the intervals in zone 3"), { ok: true, patch: { workZone: 3 } });
});

test("parser: ES requests", () => {
  assert.deepEqual(parseIntervalRequest("Hazlo 5 x 4 min con descanso de 2 min"), { ok: true, patch: { repeats: 5, workSeconds: 240, restSeconds: 120 } });
  assert.deepEqual(parseIntervalRequest("hazlo con 6 intervalos"), { ok: true, patch: { repeats: 6 } });
  assert.deepEqual(parseIntervalRequest("agrega un intervalo más"), { ok: true, patch: { repeatsDelta: 1 } });
  assert.deepEqual(parseIntervalRequest("quita un intervalo"), { ok: true, patch: { repeatsDelta: -1 } });
  assert.deepEqual(parseIntervalRequest("un intervalo menos"), { ok: true, patch: { repeatsDelta: -1 } });
  assert.deepEqual(parseIntervalRequest("intervalos de 3 minutos"), { ok: true, patch: { workSeconds: 180 } });
  assert.deepEqual(parseIntervalRequest("descanso de 90 segundos"), { ok: true, patch: { restSeconds: 90 } });
  assert.deepEqual(parseIntervalRequest("en zona 3"), { ok: true, patch: { workZone: 3 } });
});

test("parser: vague, distance-based, conflicting and empty requests become questions, never numbers", () => {
  for (const [text, code] of [["make it easier", "too_vague"], ["hazlo más duro", "too_vague"], ["5 x 400 m", "distance_not_supported"], ["10 km tempo", "distance_not_supported"],
    ["5 intervals and 6 intervals", "conflicting"], ["", "empty"], ["what's the weather", "unrecognized"]] as const) {
    const r = parseIntervalRequest(text);
    assert.equal(r.ok, false, text);
    if (!r.ok) { assert.equal(r.code, code, text); assert.ok(r.en.length > 10 && r.es.length > 10); }
  }
});

test("summary of a standard set", () => {
  assert.deepEqual(summarizeSet(session()), { repeats: 4, workSeconds: 240, restSeconds: 120, workZone: 4, hardSeconds: 960, totalSeconds: 600 + 4 * 240 + 3 * 120 + 600 });
});

test("repeats 4 → 5: rebuilds names, rest between reps only, repeat label, total grows by exactly one work + one rest", () => {
  const r = ok(applyIntervalPatch(session(), { repeats: 5 }, BIG));
  const set = r.steps.filter(s => s.phase === "active" || s.phase === "recovery");
  assert.equal(set.filter(s => s.phase === "active").length, 5);
  assert.equal(set.filter(s => s.phase === "recovery").length, 4);
  assert.equal(set[set.length - 1].phase, "active"); // no trailing rest before the cool-down
  assert.deepEqual(set.filter(s => s.phase === "active").map(s => s.name), ["Hard 1/5", "Hard 2/5", "Hard 3/5", "Hard 4/5", "Hard 5/5"]);
  assert.match(set[0].group!, /^Repeat 5 × 4 min — Threshold cruise intervals$/);
  assert.equal(r.after.totalSeconds - r.before.totalSeconds, 240 + 120);
  assert.equal(r.steps[0].name, "Warm up");
  assert.equal(r.steps[r.steps.length - 1].name, "Cool down");
  assert.equal(r.requiresConfirmation, true); // hard time 16 → 20 min = +25% > 20%
});

test("a load REDUCTION needs no extra confirmation: one less interval, shorter work, longer rest, lower zone", () => {
  for (const patch of [{ repeatsDelta: -1 }, { workSeconds: 180 }, { restSeconds: 180 }, { workZone: 3 }]) {
    const r = ok(applyIntervalPatch(session(), patch, BIG));
    assert.equal(r.requiresConfirmation, false, JSON.stringify(patch));
  }
  const r = ok(applyIntervalPatch(session(), { repeatsDelta: -1 }, BIG));
  assert.equal(r.after.repeats, 3);
  assert.equal(r.after.totalSeconds, r.before.totalSeconds - 240 - 120);
});

test("all hard-time increases and zone raises require explicit confirmation", () => {
  const small = ok(applyIntervalPatch(session(10, 60, 60, "z4"), { repeatsDelta: 1 }, BIG)); // 10 → 11 min = +10%
  assert.equal(small.requiresConfirmation, true);
  const raise = ok(applyIntervalPatch(session(4, 240, 120, "z3"), { workZone: 4 }, BIG));
  assert.equal(raise.requiresConfirmation, true);
  assert.match(raise.confirmationReasons.en.join(" "), /Z4/);
});

test("zone raises are bounded by the check-in cap, by an unknown cap, and by Z5 for chat", () => {
  const above = applyIntervalPatch(session(4, 240, 120, "z3"), { workZone: 5 }, { budgetSeconds: 7200, intensityCapZone: 4 });
  assert.equal(above.ok, false);
  if (!above.ok) assert.equal(above.code, "zone_above_cap");
  const unknown = applyIntervalPatch(session(4, 240, 120, "z3"), { workZone: 4 }, { budgetSeconds: 7200, intensityCapZone: null });
  assert.equal(unknown.ok, false);
  if (!unknown.ok) assert.equal(unknown.code, "zone_above_cap");
  const six = applyIntervalPatch(session(4, 240, 120, "z3"), { workZone: 6 }, { budgetSeconds: 7200, intensityCapZone: 7 });
  assert.equal(six.ok, false);
  if (!six.ok) assert.equal(six.code, "zone_above_chat_limit");
  // lowering never needs a known cap
  const lower = ok(applyIntervalPatch(session(4, 240, 120, "z4"), { workZone: 2 }, { budgetSeconds: 7200, intensityCapZone: null }));
  assert.equal(lower.after.workZone, 2);
});

test("time budget: an edit that would exceed it is refused with the number of repeats that would fit", () => {
  const base = session(4, 240, 120);
  const budget = base.reduce((s, x) => s + x.seconds, 0); // current total
  const r = applyIntervalPatch(base, { repeats: 8 }, { budgetSeconds: budget, intensityCapZone: 5 });
  assert.equal(r.ok, false);
  if (!r.ok) { assert.equal(r.code, "exceeds_time_budget"); assert.equal(r.maxRepeatsThatFit, 4); assert.match(r.es, /presupuesto/); }
});

test("range limits and step limit", () => {
  for (const [patch, code] of [[{ repeats: 31 }, "repeats_out_of_range"], [{ repeats: 0 }, "repeats_out_of_range"], [{ workSeconds: 5 }, "work_out_of_range"], [{ restSeconds: 2 }, "rest_out_of_range"]] as const) {
    const r = applyIntervalPatch(session(), patch, BIG);
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.code, code);
  }
  const wide = applyIntervalPatch(session(10, 30, 30, "z3"), { repeats: 30 }, { budgetSeconds: 10 * 3600, intensityCapZone: 5 }); // 30 + 29 + 2 = 61 steps
  assert.equal(wide.ok, false);
  if (!wide.ok) assert.equal(wide.code, "exceeds_step_limit");
});

test("no-op, no interval set, non-uniform set, distance/rep steps and missing rest are refused with a reason", () => {
  const same = applyIntervalPatch(session(), { repeats: 4 }, BIG);
  assert.equal(same.ok === false && same.code, "no_change");
  const steady: EditableStep[] = [{ name: "Steady", seconds: 1800, zone: "z2", phase: "warmup", endpoint: { type: "time", seconds: 1800 } }];
  const none = applyIntervalPatch(steady, { repeats: 3 }, BIG);
  assert.equal(none.ok === false && none.code, "no_interval_set");
  const uneven = session(); uneven[3] = { ...uneven[3], seconds: 300, endpoint: { type: "time", seconds: 300 } };
  const non = applyIntervalPatch(uneven, { repeats: 5 }, BIG);
  assert.equal(non.ok === false && non.code, "non_uniform_set");
  const dist = session(); dist[1] = { ...dist[1], endpoint: { type: "distance", meters: 800 } };
  const d = applyIntervalPatch(dist, { repeats: 5 }, BIG);
  assert.equal(d.ok === false && d.code, "unsupported_step");
  const single: EditableStep[] = [{ name: "Warm up", seconds: 600, zone: "z1", phase: "warmup", endpoint: { type: "time", seconds: 600 } }, { name: "Hard", seconds: 1200, zone: "z4", phase: "active", endpoint: { type: "time", seconds: 1200 } }];
  const noRest = applyIntervalPatch(single, { repeats: 3 }, BIG);
  assert.equal(noRest.ok === false && noRest.code, "no_rest_to_copy");
  const withRest = ok(applyIntervalPatch(single, { repeats: 3, restSeconds: 180 }, BIG));
  assert.equal(withRest.steps.filter(s => s.phase === "recovery").length, 2);
});

test("changing the zone drops an explicit target that no longer matches; unchanged steps keep theirs", () => {
  const s = session(); s[1] = { ...s[1], target: { type: "power", low: 250, high: 270 } };
  const zoneChange = ok(applyIntervalPatch(s, { workZone: 3 }, BIG));
  assert.equal(zoneChange.steps.some(x => x.target), false);
  const timeChange = ok(applyIntervalPatch(s, { restSeconds: 150 }, BIG));
  assert.ok(timeChange.steps.find(x => x.name === "Hard 1/4")?.target);
});

test("input is never mutated", () => {
  const original = session();
  const snapshot = JSON.stringify(original);
  ok(applyIntervalPatch(original, { repeats: 6, workSeconds: 200, restSeconds: 90, workZone: 3 }, BIG));
  assert.equal(JSON.stringify(original), snapshot);
});

test("the produced steps pass the SAME validation the card PATCH route applies (normalizeSteps + parseWorkoutCardEdit)", () => {
  const r = ok(applyIntervalPatch(session(), { repeats: 5, workSeconds: 200, restSeconds: 90 }, BIG));
  const normalized = normalizeSteps(r.steps, "bike");
  assert.equal(normalized.length, r.steps.length);
  const edit = parseWorkoutCardEdit({ id: "w1", expectedRevision: "a".repeat(64), steps: r.steps }, "bike");
  assert.equal(edit.seconds, r.after.totalSeconds);
  assert.equal(edit.steps.length, r.steps.length);
});

test("intensity cap is read only from a valid saved adaptation", async () => {
  const { readIntensityCapZone } = await import("./workout-interval-edit");
  assert.equal(readIntensityCapZone(JSON.stringify({ verdict: "full", intensityCap: "z3" })), 3);
  assert.equal(readIntensityCapZone({ intensityCap: "z5" }), 5);
  for (const bad of [null, undefined, "", "not json", JSON.stringify({ intensityCap: "z9" }), JSON.stringify({ intensityCap: 3 }), JSON.stringify({}), JSON.stringify([])]) assert.equal(readIntensityCapZone(bad as any), null);
});

test("canonical → editable: profile-derived targets are NOT frozen into the prescription; explicit author targets are kept", async () => {
  const { toEditableSteps } = await import("./workout-interval-edit");
  const canonical = normalizeSteps([
    { name: "Warm up", seconds: 600, zone: "z1", phase: "warmup" },
    { name: "Hard", seconds: 300, zone: "z4", phase: "active", target: { type: "power", low: 240, high: 260 } },
    { name: "Hard 2", seconds: 300, zone: "z4", phase: "active" },
  ], "bike", { ftp: 250 });
  assert.equal(canonical[2].target.source, "profile_reference");
  const editable = toEditableSteps(canonical as any);
  assert.deepEqual(editable[1].target, { type: "power", low: 240, high: 260 });
  assert.equal(editable[2].target, undefined);
  // and it still passes the card route's own validation
  const edit = parseWorkoutCardEdit({ id: "w", expectedRevision: "b".repeat(64), steps: editable }, "bike");
  assert.equal(edit.steps.length, 3);
});

test("a session with strides AND a main set: only the main set (most work time) is edited, strides untouched, '5K effort N' numbering kept", () => {
  const steps: EditableStep[] = [{ name: "Warm-up", seconds: 900, zone: "z2", phase: "warmup", endpoint: { type: "time", seconds: 900 } }];
  for (let i = 0; i < 4; i++) {
    steps.push({ name: "Relaxed stride", seconds: 20, zone: "z4", phase: "active", group: "Strides", endpoint: { type: "time", seconds: 20 } });
    steps.push({ name: "Easy jog", seconds: 40, zone: "z1", phase: "recovery", group: "Strides", endpoint: { type: "time", seconds: 40 } });
  }
  for (let i = 0; i < 5; i++) {
    steps.push({ name: `5K effort ${i + 1}`, seconds: 180, zone: "z5", phase: "active", group: "Main set", endpoint: { type: "time", seconds: 180 } });
    if (i < 4) steps.push({ name: "Easy recovery", seconds: 180, zone: "z1", phase: "recovery", group: "Main set", endpoint: { type: "time", seconds: 180 } });
  }
  steps.push({ name: "Cool-down", seconds: 600, zone: "z1", phase: "cooldown", endpoint: { type: "time", seconds: 600 } });
  const before = summarizeSet(steps)!;
  assert.equal(before.repeats, 5);
  assert.equal(before.workSeconds, 180);
  assert.equal(before.workZone, 5);
  const r = ok(applyIntervalPatch(steps, { repeatsDelta: -1 }, { budgetSeconds: 10_000, intensityCapZone: 5 }));
  assert.equal(r.setLabel, "Main set");
  assert.equal(r.steps.filter(s => s.group === "Strides").length, 8, "strides untouched");
  assert.deepEqual(r.steps.filter(s => s.group === "Main set" && s.phase === "active").map(s => s.name), ["5K effort 1", "5K effort 2", "5K effort 3", "5K effort 4"]);
  assert.equal(r.after.totalSeconds, before.totalSeconds - 360);
  assert.match(r.changes.en[0], /^Set: Main set/);
  // budget refusal reports how many repeats fit: fixed part + 6 repeats exactly fills this budget
  const tight = applyIntervalPatch(steps, { repeats: 9 }, { budgetSeconds: before.totalSeconds + 360 + 1, intensityCapZone: 5 });
  assert.equal(tight.ok === false && tight.code, "exceeds_time_budget");
  if (!tight.ok) assert.equal(tight.maxRepeatsThatFit, 6);
});

test("two equally large sets are ambiguous: refuse instead of picking one", () => {
  const set = (group: string): EditableStep[] => [0, 1].flatMap(i => [
    { name: `${group} ${i + 1}`, seconds: 120, zone: "z4", phase: "active" as const, group, endpoint: { type: "time" as const, seconds: 120 } },
    ...(i === 0 ? [{ name: "Easy", seconds: 60, zone: "z1", phase: "recovery" as const, group, endpoint: { type: "time" as const, seconds: 60 } }] : []),
  ]);
  const steps: EditableStep[] = [{ name: "Warm up", seconds: 600, zone: "z1", phase: "warmup", endpoint: { type: "time", seconds: 600 } }, ...set("Block A"), { name: "Float", seconds: 300, zone: "z1", phase: "warmup", endpoint: { type: "time", seconds: 300 } }, ...set("Block B")];
  const r = applyIntervalPatch(steps, { repeatsDelta: 1 }, { budgetSeconds: 10_000, intensityCapZone: 5 });
  assert.equal(r.ok === false && r.code, "ambiguous_set");
});

test("a set that ends with a rest keeps its trailing rest; a set that starts with rest is refused", () => {
  const steps = session(3);
  steps.splice(steps.length - 1, 0, { name: "Easy recovery", seconds: 120, zone: "z2", phase: "recovery", endpoint: { type: "time", seconds: 120 } });
  const r = ok(applyIntervalPatch(steps, { repeats: 4 }, BIG));
  const main = r.steps.filter(s => s.phase === "active" || s.phase === "recovery");
  assert.equal(main[main.length - 1].phase, "recovery");
  assert.equal(main.filter(s => s.phase === "active").length, 4);
  const grouped = session(3);
  const startsWithRest: EditableStep[] = [{ name: "Easy", seconds: 60, zone: "z1", phase: "recovery", group: grouped[1].group, endpoint: { type: "time", seconds: 60 } }, ...grouped.slice(1)];
  const bad = applyIntervalPatch(startsWithRest, { repeats: 4 }, BIG);
  assert.equal(bad.ok === false && bad.code, "non_uniform_set");
});
