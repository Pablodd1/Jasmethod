import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { ActualFuelingFields } from "./ActualFuelingFields";
import { isDailyTraining } from "./training-contract";

test("optional intake fields reload saved totals and distinguish zero, unknown duration and actual hourly rates",()=>{
  const details={schemaVersion:1,values:{distanceKm:42},fueling:{schemaVersion:1,carbsG:90,fluidMl:1000,giSymptoms:"mild"}};
  const render=(actualDurationMin:number|null,es=false)=>renderToStaticMarkup(React.createElement(ActualFuelingFields,{details,actualDurationMin,es}));
  const html=render(90);
  assert.match(html,/name="actualCarbsG"[^>]*value="90"/);assert.match(html,/name="actualFluidMl"[^>]*value="1000"/);
  assert.match(html,/<option value="mild" selected=""/);assert.match(html,/60 g\/h/);assert.match(html,/90 reported actual minutes/);
  assert.doesNotMatch(html,/\brequired[=>\s]|<details[^>]*open=/);assert.match(html,/never automatically raise future intake/);
  assert.match(render(null),/Saved rate: —/);assert.match(render(0),/Saved rate: —/);assert.match(render(90,true),/Tasa guardada: 60 g\/h/);
  const zero=renderToStaticMarkup(React.createElement(ActualFuelingFields,{details:{...details,fueling:{...details.fueling,carbsG:0}},actualDurationMin:90}));
  assert.match(zero,/name="actualCarbsG"[^>]*value="0"/);assert.match(zero,/Saved rate: 0 g\/h/);
});
test("daily response guard rejects malformed fueling before rendering saved input fields",()=>{
  const sample=()=>JSON.parse(readFileSync(new URL("./sample-session.json",import.meta.url),"utf8"));
  const valid={schemaVersion:1,carbsG:90,fluidMl:1000,giSymptoms:"mild"};
  let value=sample();value.completion.actual={durationMinutes:90,actualSport:"bike",sessionRpe:4,comments:null,status:"completed",actualFueling:valid};
  assert.equal(isDailyTraining(value),true);
  for(const bad of [{...valid,carbsG:"90"},{...valid,giSymptoms:["none"]},{...valid,fluidMl:-1},{...valid,schemaVersion:2}]){value=sample();value.completion.actual={actualFueling:bad};assert.equal(isDailyTraining(value),false);}
});
