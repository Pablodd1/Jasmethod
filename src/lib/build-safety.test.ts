import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

test("ordinary builds never run migrations and the tested Garmin SDK is pinned", () => {
  const pkg = JSON.parse(readFileSync("package.json", "utf8"));
  assert.equal(pkg.scripts.prebuild, undefined);
  assert.doesNotMatch(pkg.scripts.build, /migrate|db:deploy/);
  assert.equal(pkg.dependencies["@garmin/fitsdk"], "21.214.0");
  const lock = JSON.parse(readFileSync("package-lock.json", "utf8"));
  assert.equal(lock.packages["node_modules/@garmin/fitsdk"].version, "21.214.0");
});
test("preview and unauthorized production migration helpers never reach Prisma", () => {
  const run = (target: string) => spawnSync(process.execPath, ["scripts/migrate-production.mjs"], {
    encoding: "utf8", env: { ...process.env, VERCEL_ENV: target,
      DATABASE_URL: "postgresql://invalid.invalid/not-used", DIRECT_URL: "postgresql://invalid.invalid/not-used",
      JMM_PRODUCTION_MIGRATIONS_APPROVED: "false" },
  });
  const preview = run("preview");
  assert.equal(preview.status, 0);
  assert.match(preview.stdout, /Skipping database migrations/);
  const production = run("production");
  assert.equal(production.status, 1);
  assert.match(production.stderr, /No database command was run/);
  assert.doesNotMatch(production.stdout + production.stderr, /Prisma schema|Datasource|P1001/);
});
test("review branch cannot trigger an automatic Vercel deployment", () => {
  const config = JSON.parse(readFileSync("vercel.json", "utf8"));
  assert.equal(config.git.deploymentEnabled["dot/device-free-launch-20261002"], false);
  assert.equal(config.git.deploymentEnabled["science-v2-shadow"], undefined, "production branch policy is unchanged");
});
