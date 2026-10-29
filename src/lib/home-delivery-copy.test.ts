import test from "node:test";
import assert from "node:assert/strict";
import { renderWebsite } from "./test-helpers/public-website";
for(const language of ["en","es"] as const)test(`${language} homepage keeps a manual path and does not promise automatic device delivery`,()=>{
  const html=renderWebsite(language),hero=html.match(/<section[^>]*>([\s\S]*?)<\/section>/)?.[1]||"";
  assert.match(hero,language==="en"?/A clearer plan/:/Un plan más claro/);assert.match(hero,/href="(?:\/es)?\/how-it-works"/);
  assert.match(html,language==="en"?/manual check-in/:/chequeo manual/);assert.match(html,language==="en"?/permissions and actual receipt/:/permisos y recepción real/);
  assert.doesNotMatch(html,/delivers it to your watch|la entrega en tu reloj|days of history imported on day one|sincroniza HRV, FC reposo y recuperación solo|science-backed|scientifically validated|científicamente validado/i);
  assert.match(html,/href="\/login"/);assert.match(html,/synthetic example|ejemplo sintético/);
});
