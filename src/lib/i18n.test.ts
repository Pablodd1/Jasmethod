// Run: npx tsx src/lib/i18n.test.ts
import assert from "node:assert";
import { t, LANGS } from "./i18n";
import { FUEL_BRANDS, fuelBrandsFor } from "./fuelbrands";
import { RESEARCH_SOURCES, sourcesFor } from "./research";

// i18n
assert.deepEqual(LANGS.map((l) => l.code), ["en", "es", "ht", "fr", "ru"], "5 languages");
assert.equal(t("es", "nav.dashboard"), "Panel", "spanish nav");
assert.equal(t("ru", "nav.training"), "План тренировок", "russian nav");
assert.equal(t("ht", "adapt.rest"), "REPO", "creole verdict");
assert.equal(t("fr", "rec.box.name"), "Respiration carrée", "french recovery name");
assert.equal(t("xx", "nav.sleep"), "Sueño", "unknown lang falls back to es (Miami default) before en");
assert.equal(t("en", "rec.sigh.instr").length > 5, true, "instructions resolve");
// every recovery key resolves in all languages
for (const l of LANGS) {
  for (const k of ["box", "sigh", "478", "resonance", "nadi", "pmr", "dive", "legs", "exhale"]) {
    assert.ok(t(l.code, `rec.${k}.name`).length > 0, `${l.code} rec.${k}.name`);
  }
}

// fuel brands
assert.ok(FUEL_BRANDS.length >= 6, "brand list populated");
assert.ok(FUEL_BRANDS.some((b) => b.tier === "top"), "has top-tier brands");
const short = fuelBrandsFor(30);
assert.ok(short.brands.every((b) => b.type === "electrolyte"), "short sessions → electrolytes only");
const long = fuelBrandsFor(120);
assert.ok(long.brands.length > short.brands.length, "long sessions → more brands");

// research sources
assert.ok(RESEARCH_SOURCES.length >= 15, "comprehensive evidence base");
assert.ok(RESEARCH_SOURCES.every((s) => ["A", "B", "C"].includes(s.level)), "levels valid");
assert.ok(RESEARCH_SOURCES.every((s) => ["recreational", "professional", "both"].includes(s.population)), "populations valid");
assert.ok(sourcesFor(["seiler2009"]).length === 1, "source lookup by id");
assert.ok(sourcesFor(["seiler2009"])[0].ref.includes("Seiler"), "correct citation");

console.log("✓ i18n.test.ts — all assertions passed");
