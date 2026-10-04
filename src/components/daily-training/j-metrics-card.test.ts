import { test } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { JMetricsCard, type JMetrics } from "../j-metrics-card";

const sample: JMetrics = {
  version: "jstress-srpe-v1", unit: "AU", totalJStress: 300,
  eligibleSessions: 1, totalSessions: 2, coveragePct: 50,
  missingDays: 1, windowDays: 3, note: "Missing dates interrupt the series.",
  confirmedRestDays: [], timezone: "America/New_York", today: "2026-10-04",
  current: { jBase: null, jRecent: 300, jBalance: null },
  series: [
    { date: "2026-10-02", jStress: 300, jBase: null, jRecent: 300, jBalance: null },
    { date: "2026-10-03", jStress: null, jBase: null, jRecent: null, jBalance: null },
    { date: "2026-10-04", jStress: 300, jBase: null, jRecent: 300, jBalance: null },
  ],
};

test("J Metrics unavailable values stay unknown rather than zero", () => {
  const html = renderToStaticMarkup(React.createElement(JMetricsCard, { metrics: null }));
  assert.match(html, /— No data available/);
  assert.doesNotMatch(html, /Recorded JStress|<table|<svg/);
});

test("J Metrics shows reported source, coverage, units and accessible daily values", () => {
  const html = renderToStaticMarkup(React.createElement(JMetricsCard, { metrics: sample }));
  assert.match(html, /completed minutes × your session effort rating/);
  assert.match(html, /1\/2 sessions \(50%\)/);
  assert.match(html, /300 AU/);
  assert.match(html, /daily-load scale \(AU\)/);
  assert.match(html, /not measurements of fitness, fatigue or readiness/);
  assert.match(html, /View daily values/);
  assert.match(html, /scope="row"[^>]*>2026-10-03<\/th><td[^>]*>—<\/td>/);
});

test("J Metrics chart never bridges a missing day or imputes its value", () => {
  const html = renderToStaticMarkup(React.createElement(JMetricsCard, { metrics: sample }));
  assert.equal((html.match(/<circle/g) || []).length, 2);
  // The only lines are the zero baseline and three legend keys: no segment spans the gap.
  assert.equal((html.match(/<line /g) || []).length, 4);
  const consecutive = { ...sample, series: [sample.series[0], { ...sample.series[1], jRecent: 200 }, sample.series[2]] };
  const continuousHtml = renderToStaticMarkup(React.createElement(JMetricsCard, { metrics: consecutive }));
  assert.equal((continuousHtml.match(/<line /g) || []).length, 6);
});

test("Forecast-supplied J Metrics remains read-only without rest-day controls", () => {
  const html = renderToStaticMarkup(React.createElement(JMetricsCard, { metrics: sample, allowRestEntry: false }));
  assert.doesNotMatch(html, /<form|type="date"|type="checkbox"/);
  assert.match(html, /href="\/metrics"/);
});

test("New athletes see daily JStress before trends exist; unknown days differ from confirmed zero", () => {
  const metrics: JMetrics = {
    ...sample,
    current: { jBase: null, jRecent: null, jBalance: null },
    series: [
      { date: "2026-10-02", jStress: 300, jBase: null, jRecent: null, jBalance: null },
      { date: "2026-10-03", jStress: null, jBase: null, jRecent: null, jBalance: null },
      { date: "2026-10-04", jStress: 0, jBase: null, jRecent: null, jBalance: null },
    ],
  };
  const html = renderToStaticMarkup(React.createElement(JMetricsCard, { metrics }));
  assert.equal((html.match(/<rect /g) || []).length, 1);
  assert.match(html, /<rect[^>]*data-daily-load="300"/);
  assert.match(html, /<circle[^>]*data-daily-load="0"/);
  assert.equal((html.match(/data-daily-load=/g) || []).length, 2);
  assert.match(html, /daily bars/);
});
