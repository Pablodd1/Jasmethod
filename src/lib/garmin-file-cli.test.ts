import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync, readFileSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const root = process.cwd();
const run = (args: string[]) => spawnSync(process.execPath, ["--import", "tsx", "scripts/preview-garmin-file.ts", ...args], { cwd: root, encoding: "utf8", timeout: 10_000, env: { ...process.env, DATABASE_URL: "invalid-and-must-not-be-used", DIRECT_URL: "invalid-and-must-not-be-used" } });

test("retired Garmin direct import cannot load a file, credentials or Prisma", () => {
  const source = readFileSync(join(root, "scripts/import-garmin-csv.cjs"), "utf8");
  assert.doesNotMatch(source, /require\(|process\.env|readFile|PrismaClient/);
  const result = spawnSync(process.execPath, ["scripts/import-garmin-csv.cjs", "synthetic@example.invalid", "/does/not/exist.csv"], { cwd: root, encoding: "utf8", timeout: 5000 });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /no file was read and nothing was saved/);
  assert.match(result.stderr, /preview-garmin-file\.ts/);
  assert.match(result.stderr, /old <email> <file> syntax is not supported/);
});

test("local CLI uses the shared parser and previews without database credentials", () => {
  const dir = mkdtempSync(join(tmpdir(), "garmin-cli-test-"));
  try {
    const path = join(dir, "Activities.csv");
    writeFileSync(path, "Activity Type,Date,Title,Distance,Time\nRunning,2026-01-01 08:00:00,Synthetic run,5.25,00:30:30\n");
    const result = run(["--file", path, "--timezone", "UTC", "--unit-system", "metric", "--number-format", "decimal-dot"]);
    assert.equal(result.status, 0, result.stderr);
    const preview = JSON.parse(result.stdout);
    assert.equal(preview.saved, false);
    assert.equal(preview.workouts.length, 1);
    assert.equal(preview.workouts[0].durationMin, 31);
    assert.equal(preview.workouts[0].sourceDurationSeconds, 1830);
    assert.equal(preview.workouts[0].distanceKm, 5.25);
    assert.match(preview.guidance, /reviewing and confirming/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("CLI rejects old syntax, unsupported FIT, missing options and symbolic links safely", () => {
  const dir = mkdtempSync(join(tmpdir(), "garmin-cli-test-"));
  try {
    const csv = join(dir, "Activities.csv"), fit = join(dir, "Activity.fit"), link = join(dir, "link.csv");
    writeFileSync(csv, "Activity Type,Date,Title,Distance,Time\nRunning,2026-01-01 08:00:00,Synthetic run,5,00:30:00\n");
    writeFileSync(fit, "synthetic-not-a-fit");
    symlinkSync(csv, link);
    assert.equal(run(["synthetic@example.invalid", csv]).status, 1);
    const missing = run(["--file", csv]);
    assert.equal(missing.status, 1);
    assert.ok(JSON.parse(missing.stdout).diagnostics.some((d: { code: string }) => d.code === "TIMEZONE_REQUIRED"));
    const unsupported = run(["--file", fit]);
    assert.equal(unsupported.status, 1);
    assert.ok(JSON.parse(unsupported.stdout).diagnostics.some((d: { code: string }) => d.code === "FIT_UNSUPPORTED"));
    const symlink = run(["--file", link]);
    assert.equal(symlink.status, 1);
    assert.match(symlink.stderr, /could not be read safely/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
