import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import vm from "node:vm";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import { accountLanding } from "./account-landing";

const requireModule = createRequire(import.meta.url);
const athlete = { id: "fixture-athlete", name: "Fixture Athlete", email: "athlete@example.invalid", role: "athlete", language: "en" };

// Render the real components with session/router boundaries replaced. No accounts,
// provider authorization or network requests are created by these tests.
function loadComponent(file: string, options: { user?: typeof athlete | null; loading?: boolean; error?: boolean; query?: string; pathname?: string } = {}) {
  const output = ts.transpileModule(readFileSync(file, "utf8"), { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true,
  } }).outputText;
  const fixtureModule = { exports: {} as Record<string, React.ComponentType<any>> };
  const session = { user: options.user ?? null, loading: options.loading ?? false, error: options.error ?? false, refresh: async () => {}, logout: async () => {} };
  const dependencies: Record<string, unknown> = {
    "@/lib/account-landing": { accountLanding },
    "./auth": { useAuth: () => session },
    "next/navigation": { usePathname: () => options.pathname || "/today", useSearchParams: () => new URLSearchParams(options.query || "") },
    "next/link": { __esModule: true, default: ({ children, ...props }: any) => React.createElement("a", props, children) },
    "./social-sign-in": { SocialSignIn: ({ intent }: { intent: string }) => React.createElement("div", { "data-provider-intent": intent }, "Provider controls") },
    "./error-telemetry": { ErrorTelemetry: () => null },
    "@/lib/i18n": { LANGS: [{ code: "en", native: "English" }], t: (_lang: string, key: string) => key },
  };
  vm.runInNewContext(output, { module: fixtureModule, exports: fixtureModule.exports, URLSearchParams, require: (name: string) =>
    name in dependencies ? dependencies[name] : requireModule(name),
  }, { filename: file });
  return fixtureModule.exports;
}

test("logged-out linking requires existing credentials before provider controls", () => {
  for (const query of ["link=1", "provider=google&error=account_link_required", "mode=signup&link=1"]) {
    const { AuthCard } = loadComponent("src/components/auth-card.tsx", { query });
    const html = renderToStaticMarkup(React.createElement(AuthCard));
    assert.match(html, /Sign in, then link Google/);
    assert.match(html, /href="\/forgot-password"/);
    assert.doesNotMatch(html, /data-provider-intent|Create free athlete account|name="name"/);
  }
});

test("direct free-signup link opens personal registration, not a shared account", () => {
  const { AuthCard } = loadComponent("src/components/auth-card.tsx", { query: "mode=signup" });
  const html = renderToStaticMarkup(React.createElement(AuthCard));
  assert.match(html, /Create your free athlete account/);
  assert.match(html, /name="name"/);
  assert.match(html, /autoComplete="new-password"/);
  assert.match(html, /data-provider-intent="signup"/);
  assert.doesNotMatch(html, /Jasmel Acosta|value="athlete@example/);
});

test("linking displays the authenticated identity and does not offer account creation", () => {
  const { AuthCard } = loadComponent("src/components/auth-card.tsx", { query: "link=1", user: athlete });
  const html = renderToStaticMarkup(React.createElement(AuthCard));
  assert.match(html, /Fixture Athlete/);
  assert.match(html, /athlete@example.invalid/);
  assert.match(html, /data-provider-intent="link"/);
  assert.match(html, /does not combine separate athlete and coach accounts/);
  assert.doesNotMatch(html, /<form|name="password"/);
});

test("unverified linking session never exposes provider controls", () => {
  for (const status of [{ loading: true }, { error: true }]) {
    const { AuthCard } = loadComponent("src/components/auth-card.tsx", { query: "link=1", ...status });
    const html = renderToStaticMarkup(React.createElement(AuthCard));
    assert.match(html, /Checking which account|could not verify your session/);
    assert.doesNotMatch(html, /data-provider-intent|<form/);
  }
});

test("mobile primary navigation has four distinct destinations and one coach", () => {
  const { MobileNav } = loadComponent("src/components/app-shell.tsx", { user: athlete });
  const html = renderToStaticMarkup(React.createElement(MobileNav));
  assert.deepEqual([...html.matchAll(/href="([^"]+)"/g)].map(match => match[1]), ["/today", "/training", "/coach", "/settings"]);
  assert.doesNotMatch(html, /href="\/daily"/);
  assert.match(html, /Training plan/);
});

test("administrator navigation stays role-specific and athlete setup remains accessible", () => {
  for (const role of ["athlete", "coach", "admin"]) {
    const { AppShell } = loadComponent("src/components/app-shell.tsx", { user: { ...athlete, role } });
    const html = renderToStaticMarkup(React.createElement(AppShell, null, "Fixture content"));
    assert.equal(html.includes('href="/admin"'), role !== "athlete");
    assert.match(html, /href="\/onboard\?redo=1"/);
    assert.match(html, /Today display:/);
    assert.match(html, /href="\/daily"/);
  }
});
