/**
 * Baseline the production database: mark 0_init as already applied.
 * Fixes P3005 — prod DB has the tables (created via `db push`) but no
 * _prisma_migrations record, so `prisma migrate deploy` refuses to run.
 * Idempotent: re-running is safe.
 * Run: node scripts/baseline-db.cjs
 */
const { execSync } = require("child_process");

try {
  execSync("npx prisma migrate resolve --applied 0_init", { stdio: "inherit" });
  console.log("baseline done");
} catch (e) {
  console.error("FAILED:", e.message);
  process.exit(1);
}
