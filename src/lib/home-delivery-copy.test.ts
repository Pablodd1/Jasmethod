import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import { createElement, type ComponentType } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";

const require = createRequire(import.meta.url);
function renderHome(language: "en" | "es") {
  const source = readFileSync("src/app/page.tsx", "utf8");
  const compiled = ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX,
  } }).outputText;
  const loaded = { exports: {} as { default: ComponentType } };
  runInNewContext(compiled, { module: loaded, exports: loaded.exports, require: (key: string) => {
    if (key === "react/jsx-runtime") return require(key);
    if (key === "next/link") return { default: ({ children, ...props }: any) => createElement("a", props, children) };
    if (key === "@/components/auth") return { useAuth: () => ({ language, user: null }) };
    if (key === "@/components/site-shell") return { SiteHeader: () => null };
    if (key === "lucide-react") return new Proxy({}, { get: () => () => null });
    throw new Error(`Unexpected homepage dependency: ${key}`);
  } });
  return renderToStaticMarkup(createElement(loaded.exports.default));
}

for (const language of ["en", "es"] as const) {
  test(`${language} homepage describes manual FIT transfer and conditional integrations`, () => {
    const html = renderHome(language);
    const hero = html.match(/<section[^>]*>([\s\S]*?)<\/section>/)?.[1] ?? "";
    assert.match(hero, language === "en" ? /manual check-in/ : /chequeo manual/);
    assert.match(hero, language === "en" ? /FIT workouts for manual transfer/ : /FIT compatibles para transferirlos manualmente/);
    assert.match(hero, language === "en" ? /availability, setup and consent/ : /disponibilidad, configuración y tu consentimiento/);
    assert.match(html, language === "en" ? /verify compatibility and import on your device/ : /comprueba la compatibilidad y la importación en tu dispositivo/);
    assert.match(html, language === "en" ? /Email plan delivery is unavailable/ : /El envío del plan por email no está disponible/);
    assert.match(html, language === "en" ? /guided by your check-ins, available in the app/ : /guiado por tus chequeos, disponible en la app/);
    assert.doesNotMatch(html, /delivers it to your watch|la entrega en tu reloj|Structured workout to your Garmin|Entrenamiento estructurado a tu Garmin|via Intervals\.icu|vía Intervals\.icu|on your watch\.|en tu reloj\.|syncs HRV, RHR and recovery by itself|sincroniza HRV, FC reposo y recuperación solo|days of history imported on day one|días de historial importados el primer día/i);
    assert.doesNotMatch(hero, /science-backed|scientifically validated|científicamente validado/i);
    assert.match(html, /href="\/login"/);
  });
}
