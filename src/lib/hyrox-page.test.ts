import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import vm from "node:vm";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";

const requireModule = createRequire(import.meta.url);
function page(options: { language?: string; target?: string; sex?: string; pro?: string; plan?: boolean } = {}) {
  const requests: Array<{ url: string; body?: any }> = [];
  const updates: any[] = [];
  const overrides = [options.target, undefined, options.sex, options.pro, undefined,
    options.plan ? { notes: [], segments: [] } : undefined];
  let index = 0;
  const dependencies: Record<string, unknown> = {
    react: { ...React, useEffect: () => {}, useState: (initial: unknown) => {
      const value = overrides[index++] ?? initial; return [value, (next: unknown) => updates.push(next)];
    } },
    "@/components/auth": { useAuth: () => ({ user: { language: options.language || "en", profile: { sex: "female" } } }) },
    "@/components/gate": { ProtectedPage: ({ children }: any) => children },
  };
  const output = ts.transpileModule(readFileSync("src/app/hyrox/page.tsx", "utf8"), { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX,
  } }).outputText;
  const fixture = { exports: {} as { default: () => React.ReactElement } };
  vm.runInNewContext(output, { module: fixture, exports: fixture.exports, URLSearchParams,
    fetch: async (url: string, init?: RequestInit) => {
      requests.push({ url, ...(init?.body ? { body: JSON.parse(String(init.body)) } : {}) });
      return { ok: true, json: async () => ({ plan: { notes: [], segments: [] }, analysis: {} }) };
    }, require: (name: string) => name in dependencies ? dependencies[name] : requireModule(name) });
  const tree = fixture.exports.default();
  const nodes: React.ReactElement<any>[] = [];
  function visit(node: React.ReactNode) {
    if (Array.isArray(node)) return node.forEach(visit);
    if (React.isValidElement<any>(node)) { nodes.push(node); visit(node.props.children); }
  }
  visit(tree);
  return { requests, updates, nodes, html: renderToStaticMarkup(tree) };
}

test("HYROX starts without guessed target or division and blocks both request paths until chosen", async () => {
  for (const language of ["en", "es"]) {
    const fixture = page({ language, plan: true });
    for (const id of ["hyrox-target", "hyrox-sex", "hyrox-pro"]) {
      assert.equal(fixture.nodes.find(n => n.props.id === id)!.props.value, "");
    }
    const buttons = fixture.nodes.filter(n => n.type === "button");
    assert.equal(buttons.length, 2);
    for (const button of buttons) { assert.equal(button.props.disabled, true); await button.props.onClick(); }
    assert.equal(fixture.requests.length, 0);
    assert.match(fixture.html, language === "en" ? /not saved.*future coaching.*Reloading/ : /no se guardan.*coaching futuro.*recargar/);
  }
});

test("HYROX selection sends exactly the athlete's chosen division for build and analysis", async () => {
  for (const [sex, pro] of [["male", "0"], ["female", "1"]]) {
    const fixture = page({ target: "100", sex, pro, plan: true });
    const buttons = fixture.nodes.filter(n => n.type === "button");
    for (const button of buttons) { assert.equal(button.props.disabled, false); await button.props.onClick(); }
    const query = new URL(fixture.requests[0].url, "https://app.example.invalid").searchParams;
    assert.equal(query.get("sex"), sex); assert.equal(query.get("pro"), pro); assert.equal(query.get("target"), "100");
    assert.equal(fixture.requests[1].body.sex, sex); assert.equal(fixture.requests[1].body.pro, pro === "1");
    assert.equal(fixture.requests[1].body.actualSecs.length, 16);
  }
});

test("HYROX target or division omissions cannot silently fall back to the athlete's profile", async () => {
  for (const inputs of [{ target: "100", sex: "female" }, { target: "100", pro: "0" },
    { target: "0", sex: "female", pro: "0" }, { target: "NaN", sex: "male", pro: "1" }]) {
    const fixture = page(inputs);
    const button = fixture.nodes.find(n => n.type === "button")!;
    assert.equal(button.props.disabled, true); await button.props.onClick(); assert.equal(fixture.requests.length, 0);
  }
});
