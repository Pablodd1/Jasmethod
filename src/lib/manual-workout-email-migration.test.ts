import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const migration = readFileSync(
  "prisma/migrations/20261009124500_manual_workout_email/migration.sql",
  "utf8",
).replace(/--[^\n]*/g, "").trim();
const tables = [
  "ManualWorkoutEmailPreference",
  "ManualWorkoutEmailOutbox",
  "ManualWorkoutEmailDispatch",
];

test("manual email table creation and client protection commit atomically", () => {
  assert.match(migration, /^BEGIN;/);
  assert.match(migration, /COMMIT;$/);
  assert.equal((migration.match(/\bBEGIN;/g) ?? []).length, 1);
  assert.equal((migration.match(/\bCOMMIT;/g) ?? []).length, 1);
  for (const table of tables) {
    const creation = migration.indexOf(`CREATE TABLE "${table}"`);
    const protection = migration.indexOf(`ALTER TABLE "${table}" ENABLE ROW LEVEL SECURITY;`);
    assert.ok(creation > migration.indexOf("BEGIN;"), `${table} is created inside the transaction`);
    assert.ok(protection > creation, `${table} enables RLS after creation`);
    assert.ok(protection < migration.indexOf("COMMIT;"), `${table} is protected before commit`);
  }
});

test("manual email storage has no client policies or global privilege changes", () => {
  assert.doesNotMatch(migration, /\bCREATE\s+POLICY\b/i);
  assert.doesNotMatch(migration, /\b(?:GRANT|REVOKE)\b/i);
  assert.doesNotMatch(migration, /\bALTER\s+DEFAULT\s+PRIVILEGES\b/i);
  assert.doesNotMatch(migration, /\b(?:DISABLE|FORCE)\s+ROW\s+LEVEL\s+SECURITY\b/i);
});

test("account smoke storage is also protected before its creation transaction commits", () => {
  const smokeMigration = readFileSync(
    "prisma/migrations/20261011170500_account_smoke_receipts/migration.sql",
    "utf8",
  ).replace(/--[^\n]*/g, "").trim();
  assert.match(smokeMigration, /^BEGIN;/);
  assert.match(smokeMigration, /COMMIT;$/);
  assert.equal((smokeMigration.match(/\bBEGIN;/g) ?? []).length, 1);
  assert.equal((smokeMigration.match(/\bCOMMIT;/g) ?? []).length, 1);
  for (const table of ["AccountSmokeReceipt", "AccountSmokeTelegram"]) {
    const creation = smokeMigration.indexOf(`CREATE TABLE "${table}"`);
    const protection = smokeMigration.indexOf(`ALTER TABLE "${table}" ENABLE ROW LEVEL SECURITY;`);
    assert.ok(creation > smokeMigration.indexOf("BEGIN;"));
    assert.ok(protection > creation);
    assert.ok(protection < smokeMigration.indexOf("COMMIT;"));
  }
  assert.doesNotMatch(smokeMigration, /\b(?:CREATE\s+POLICY|GRANT|REVOKE|ALTER\s+DEFAULT\s+PRIVILEGES)\b/i);
});
