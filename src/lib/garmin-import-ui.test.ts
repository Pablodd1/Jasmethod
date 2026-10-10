import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { canSaveGarminPreview, garminDiagnosticText, hasImportCounts, isGarminPreview } from "../components/garmin-import-panel";

const counts = { new: 1, updated: 0, duplicate: 0, skipped: 0, rejected: 0 };
function fixture() {
  return {
    previewToken: "a".repeat(64), format: "activities-csv" as const, counts: { ...counts },
    coverage: { start: "2026-10-01T10:00:00.000Z", end: "2026-10-01T10:00:00.000Z", accepted: 1, completeArchive: false as const },
    warnings: [], diagnostics: [], sample: [{ date: "2026-10-01T10:00:00.000Z", sport: "run", title: "Morning run", durationMin: 30, distanceKm: 5, status: "new" }], canCommit: true,
  };
}

test("Garmin UI requires verified, complete integer counts instead of inventing zeros", () => {
  assert.equal(hasImportCounts(counts), true);
  assert.equal(hasImportCounts({ new: 0, updated: 0, duplicate: 0, skipped: 0, rejected: 0 }), true);
  for (const value of [null, {}, { ...counts, rejected: undefined }, { ...counts, new: -1 }, { ...counts, duplicate: 0.5 }, { ...counts, new: "1" }, { ...counts, new: NaN }, { ...counts, new: Infinity }]) {
    assert.equal(hasImportCounts(value), false);
  }
});

test("Garmin UI rejects incomplete previews and missing or invalid confirmation tokens", () => {
  assert.equal(isGarminPreview(fixture()), true);
  for (const value of [null, {}, { ...fixture(), previewToken: "" }, { ...fixture(), previewToken: "guess" }, { ...fixture(), counts: {} }, { ...fixture(), canCommit: "true" }, { ...fixture(), coverage: { ...fixture().coverage, completeArchive: true } }, { ...fixture(), coverage: { ...fixture().coverage, start: "invalid" } }, { ...fixture(), warnings: null }, { ...fixture(), sample: [{ ...fixture().sample[0], distanceKm: -1 }] }, { ...fixture(), sample: [{ ...fixture().sample[0], durationMin: NaN }] }, { ...fixture(), sample: [{ ...fixture().sample[0], status: "unknown" }] }]) {
    assert.equal(isGarminPreview(value), false);
  }
});

test("Garmin save stays disabled for duplicate-only, rejected and unsupported previews", () => {
  assert.equal(canSaveGarminPreview(null), false);
  assert.equal(canSaveGarminPreview(fixture()), true);
  assert.equal(canSaveGarminPreview({ ...fixture(), counts: { ...counts, new: 0, updated: 1 } }), true);
  assert.equal(canSaveGarminPreview({ ...fixture(), counts: { ...counts, new: 0, duplicate: 1 } }), false);
  assert.equal(canSaveGarminPreview({ ...fixture(), canCommit: false }), false);
  assert.equal(canSaveGarminPreview({ ...fixture(), previewToken: "" }), false);
  assert.equal(canSaveGarminPreview({ ...fixture(), format: "unsupported" }), false);
});

test("Every emitted Garmin parser diagnostic has Spanish guidance", () => {
  const parser = readFileSync("src/lib/garmin-file-import.ts", "utf8");
  const codes = new Set([...parser.matchAll(/(?:fail\(|code:\s*)"([A-Z_]+)"/g)].map(match => match[1]));
  assert.ok(codes.size > 40);
  for (const code of codes) {
    assert.notEqual(garminDiagnosticText(code, "untranslated", true), "untranslated", code);
    assert.equal(garminDiagnosticText(code, "Original English", false), "Original English");
  }
});

test("Garmin upload routes through the preview panel and has no browser persistence or direct import", () => {
  const panel = readFileSync("src/components/garmin-import-panel.tsx", "utf8");
  const page = readFileSync("src/app/connectors/page.tsx", "utf8");
  assert.match(page, /p\.id === "garmin" && <GarminImportPanel/);
  assert.match(page, /p\.method === "upload" && p\.id !== "garmin"/);
  assert.match(panel, /fetch\("\/api\/import\/garmin\/preview"/);
  assert.match(panel, /fetch\("\/api\/import\/garmin\/commit"/);
  assert.doesNotMatch(panel, /fetch\("\/api\/import"/);
  assert.doesNotMatch(panel, /localStorage|sessionStorage|indexedDB/);
  assert.match(panel, /window\.addEventListener\("pagehide", discard\)/);
  assert.match(panel, /request\.current\.generation !== generation/);
  assert.match(panel, /role="alert"/);
  assert.match(panel, /role="status"/);
  assert.match(panel, /Confirmar y guardar/);
  assert.match(panel, /Confirm and save/);
});
