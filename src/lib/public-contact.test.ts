import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import vm from "node:vm";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import { PUBLIC_CONTACT_EMAIL, PUBLIC_CONTACT_MAILTO } from "./public-contact";
import { supportContacts, supportCategories, supportEmailDraft } from "./support-contact";

const requireModule = createRequire(import.meta.url);
function render(file: string, props = {}, language = "en") {
  const output = ts.transpileModule(readFileSync(file, "utf8"), { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true,
  } }).outputText;
  const fixture = { exports: {} as Record<string, React.ComponentType<any>> };
  const dependencies: Record<string, unknown> = {
    "@/lib/public-contact": { PUBLIC_CONTACT_EMAIL, PUBLIC_CONTACT_MAILTO },
    "@/lib/support-contact": { supportCategories, supportEmailDraft },
    "@/components/site-shell": { SiteHeader: () => null, SiteFooter: () => null },
    "@/components/auth": { useAuth: () => ({ user: { language } }) },
    "@/components/gate": { ProtectedPage: ({ children }: any) => children },
    "next/link": { __esModule: true, default: ({ children, ...rest }: any) => React.createElement("a", rest, children) },
  };
  vm.runInNewContext(output, { module: fixture, exports: fixture.exports, require: (name: string) =>
    name in dependencies ? dependencies[name] : requireModule(name),
  }, { filename: file });
  return renderToStaticMarkup(React.createElement(fixture.exports.default || fixture.exports.SupportContact, props));
}

test("public privacy and terms render the same working contact in accessible email links", () => {
  assert.equal(PUBLIC_CONTACT_EMAIL, "jasmel@jasmiamimethod.fit");
  for (const page of ["privacy", "terms"]) {
    const html = render(`src/app/${page}/page.tsx`);
    assert.ok(html.includes(`href="${PUBLIC_CONTACT_MAILTO}"`));
    assert.ok(html.includes(`>${PUBLIC_CONTACT_EMAIL}</a>`));
    assert.doesNotMatch(html, /jasmelacosta@gmail\.com|coach@jasmiamimethod\.com/);
    if (page === "privacy") {
      assert.equal(html.split(`href="${PUBLIC_CONTACT_MAILTO}"`).length - 1, 4);
      assert.match(html, /deletion is final and completes within 30 days/);
      assert.match(html, /la eliminación es definitiva y se completa en 30 días/);
    }
  }
});

test("nutrition inquiries use the shared public contact in both languages", () => {
  // This page starts with a loading state; inspect its localized contact source.
  const source = readFileSync("src/app/nutrition/page.tsx", "utf8");
  assert.match(source, /Contacta a Jasmel Acosta para precios y programación:/);
  assert.match(source, /Contact Jasmel Acosta for pricing and scheduling:/);
  assert.match(source, /href=\{PUBLIC_CONTACT_MAILTO\}[^>]*>\{PUBLIC_CONTACT_EMAIL\}/);
  assert.doesNotMatch(source, /jasmelacosta@gmail\.com/);
});

test("support renders an email draft without deployment email configuration", () => {
  const html = render("src/components/support-contact.tsx", { contacts: supportContacts({}), telegramSupportAvailable: false });
  assert.ok(html.includes(`Draft an email to ${PUBLIC_CONTACT_EMAIL}`));
  assert.ok(html.includes(`href="mailto:${encodeURIComponent(PUBLIC_CONTACT_EMAIL)}?subject=`));
  assert.doesNotMatch(html, /has not configured a support contact/);
  assert.match(html, /Opening either link does not send a message/);
});
