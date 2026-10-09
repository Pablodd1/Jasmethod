import test from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { NativeDeviceStatus } from "./NativeDeviceStatus";

for (const es of [false, true]) test(`native device status starts disabled with truthful delivery stages (${es ? "ES" : "EN"})`, () => {
  const html = renderToStaticMarkup(createElement(NativeDeviceStatus, { es, sessionId: "s1", revision: "r1" }));
  assert.match(html, /<details/);
  assert.match(html, /<summary/);
  assert.match(html, /COROS/);
  assert.match(html, /Apple Watch/);
  assert.ok(!html.includes("apple-export?"));
  assert.ok(!html.includes("authorize"));
  assert.match(html, es ? /desactivadas/ : /disabled/);
  assert.match(html, es ? /estados diferentes/ : /separate states/);
});
