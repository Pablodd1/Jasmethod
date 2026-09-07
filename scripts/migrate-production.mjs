import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";

if (process.env.VERCEL_ENV !== "production") {
  console.log("Skipping database migrations outside a Vercel Production build.");
  process.exit(0);
}

if (!process.env.DATABASE_URL || !process.env.DIRECT_URL) {
  console.error(
    "Production migration requires both DATABASE_URL and DIRECT_URL.",
  );
  process.exit(1);
}

const require = createRequire(import.meta.url);
const prismaCli = require.resolve("prisma/build/index.js");
const result = spawnSync(process.execPath, [prismaCli, "migrate", "deploy"], {
  env: process.env,
  stdio: "inherit",
});

if (result.error) throw result.error;
process.exit(result.status ?? 1);
