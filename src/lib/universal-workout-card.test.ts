import test from "node:test";
import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import React, { createElement } from "react";
import { Decoder, Stream } from "@garmin/fitsdk";
import { universalWorkoutExample } from "./universal-workout-example";
import { buildUniversalWorkoutCard } from "./universal-workout-card-server";
import {
  renderUniversalWorkoutSvg,
  renderUniversalWorkoutPng,
} from "./universal-workout-render";
import { buildFitWorkout } from "./fit-export";
import { UniversalWorkoutCard } from "../components/daily-training/UniversalWorkoutCard";
import { parseWorkoutCardEdit } from "./workout-card-edit";

test("56-minute example has exactly five main efforts and four main recoveries in the authoritative steps", () => {
  const card = universalWorkoutExample(),
    steps = card.session.steps;
  assert.equal(card.session.exactTimeSeconds, 3360);
  assert.equal(
    steps.filter((s) => s.group === "Main set" && s.phase === "active").length,
    5,
  );
  assert.equal(
    steps.filter((s) => s.group === "Main set" && s.phase === "recovery")
      .length,
    4,
  );
  assert.equal(
    steps.filter((s) => s.group === "Strides" && s.phase === "active").length,
    4,
  );
});
test("real FIT export independently decodes the same exact intervals and total", () => {
  const s = universalWorkoutExample().session;
  const bytes = buildFitWorkout(s, new Date("2026-10-12T12:00Z"));
  const decoder = new Decoder(Stream.fromByteArray(bytes));
  assert.equal(decoder.checkIntegrity(), true);
  const decoded = decoder.read();
  assert.deepEqual(decoded.errors, []);
  const rows = (decoded.messages as any).workoutStepMesgs;
  assert.equal(rows.length, s.steps.length);
  assert.equal(
    rows.reduce((n: number, row: any) => n + row.durationTime, 0),
    3360,
  );
  assert.deepEqual(
    rows.map((row: any) => row.durationTime),
    s.steps.map((st) => st.seconds),
  );
});
test("SVG, PNG and EN/ES interactive markup reflect the same snapshot with no invented nutrition", () => {
  for (const lang of ["en", "es"] as const) {
    const card = universalWorkoutExample(lang),
      svg = renderUniversalWorkoutSvg(card),
      png = renderUniversalWorkoutPng(card);
    assert.match(svg, /56 MIN/);
    assert.equal((svg.match(/<title>5K effort [1-5]/g) || []).length, 5);
    assert.equal(png.toString("hex", 0, 8), "89504e470d0a1a0a");
    assert.equal(png.readUInt32BE(16), 1024);
    const previous = (globalThis as any).React;
    (globalThis as any).React = React;
    let html: string;
    try {
      html = renderToStaticMarkup(
        createElement(UniversalWorkoutCard, { card }),
      );
    } finally {
      (globalThis as any).React = previous;
    }
    assert.match(html, new RegExp(card.session.revision));
    assert.match(html, lang === "es" ? /LA SECUENCIA/ : /THE FLOW/);
    assert.equal(card.nutrition, null);
    assert.match(
      card.content.before.join(" "),
      lang === "es" ? /no está disponible/ : /unavailable/,
    );
  }
});
test("held/rest cards contain no executable steps or fueling doses", () => {
  const session = universalWorkoutExample().session;
  for (const verdict of ["blocked", "rest"] as const) {
    const card = buildUniversalWorkoutCard(
      {
        ...session,
        verdict,
        steps: [],
        durationMin: 0,
        exactTimeSeconds: null,
        capability: { ...session.capability, available: false },
      },
      null,
    );
    assert.equal(card.content.steps.length, 0);
    assert.equal(card.nutrition, null);
    assert.doesNotMatch(renderUniversalWorkoutSvg(card), /5K effort/);
  }
});
test("poster escapes text so saved titles cannot execute markup", () => {
  const card = universalWorkoutExample();
  card.session.title = '<script>alert("x")</script>';
  const svg = renderUniversalWorkoutSvg(card);
  assert.doesNotMatch(svg, /<script>/);
  assert.match(svg, /&lt;SCRIPT&gt;/);
});
test("step editing rejects missing revisions, unsupported endpoints and reversed target units", () => {
  const s = universalWorkoutExample().session;
  const steps = s.steps.map((st) => ({
    name: st.name,
    seconds: st.seconds,
    zone: st.zone,
    phase: st.phase,
    target: { type: "open" },
  }));
  const body = { id: s.id, expectedRevision: s.revision, steps };
  assert.equal(parseWorkoutCardEdit(body, "run").seconds, 3360);
  assert.throws(
    () => parseWorkoutCardEdit({ ...body, expectedRevision: "old" }, "run"),
    /Reload/,
  );
  assert.throws(
    () =>
      parseWorkoutCardEdit(
        {
          ...body,
          steps: [
            { ...steps[0], endpoint: { type: "distance", meters: 1000 } },
          ],
        },
        "run",
      ),
    /timed steps/,
  );
  assert.throws(
    () =>
      parseWorkoutCardEdit(
        {
          ...body,
          steps: [
            { ...steps[0], target: { type: "pace", low: 300, high: 200 } },
          ],
        },
        "run",
      ),
    /lower bound/,
  );
});

test("duration-only edits preserve profile-reference targets as references",()=>{
  const sample=universalWorkoutExample().session;
  const edit=parseWorkoutCardEdit({id:sample.id,expectedRevision:sample.revision,steps:[{name:"Steady",phase:"active",zone:"z2",seconds:300}]},"bike");
  assert.equal("target" in edit.steps[0],false);
});


test("edited endurance steps survive check-in and are held when the time or intensity decision shrinks", async () => {
  const { preserveSportStructure, holdStructuredPlanEdit } = await import("./preserve-sport-structure");
  const steps = [{name:"Easy",phase:"active",zone:"z2",seconds:300,endpoint:{type:"time",seconds:300}}];
  const prescription = {sport:"run",durationMin:5,sportStructureBudgetMin:5,sportStructure:{schemaVersion:1,kind:"endurance",steps},steps:[]};
  const workout={userId:"synthetic",sport:"run",title:"Manual",prescription:JSON.stringify(prescription)};
  const generated={verdict:"planned",durationMin:10,intensity:"z2",steps:[],detail:{main:"Generated"}};
  const retained=preserveSportStructure(workout,generated);
  assert.deepEqual(retained.sportStructure,prescription.sportStructure);
  assert.equal(retained.durationMin,5);
  for(const changed of [{...generated,durationMin:4},{...generated,intensity:"z1"}]){
    const held=preserveSportStructure(workout,changed);
    assert.equal(held.verdict,"rest");
    assert.equal(held.durationMin,0);
    assert.deepEqual(held.sportStructure,prescription.sportStructure);
  }
  assert.ok(JSON.parse(holdStructuredPlanEdit(workout.prescription,"run","Changed")!).sportStructure);
  assert.equal(holdStructuredPlanEdit(workout.prescription,"bike","Changed"),null);
});


test("delivery subject identifies the actual sport and sanitizes date headers",async()=>{
  const { manualWorkoutEmail } = await import("./manual-workout-email-template");
  const input={language:"en" as const,kind:"ready" as const,dateLabel:"2026-10-14\r\nInjected",revision:"synthetic",workoutUrl:"https://example.invalid/daily",settingsUrl:"https://example.invalid/settings"};
  const mail=manualWorkoutEmail({...input,workoutSport:"run"});
  assert.equal(mail.subject,"Run Training — 2026-10-14 Injected");
  assert.doesNotMatch(mail.subject,/[\r\n]/);
  assert.match(manualWorkoutEmail({...input,language:"es",workoutSport:"bike"}).subject,/Ciclismo entrenamiento/);
  assert.match(manualWorkoutEmail({...input,kind:"held",workoutSport:"run"}).subject,/on hold/);
});
