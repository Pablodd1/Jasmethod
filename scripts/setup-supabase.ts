// One-shot Supabase wiring for the MVP demo.
//
// Builds DATABASE_URL (transaction pooler, port 6543) + DIRECT_URL (session/direct,
// port 5432) from the project ref + region + DB password, writes them into the
// gitignored .env, applies the Prisma schema, and provisions the two demo accounts.
//
// Usage (password not committed anywhere):
//   SUPABASE_DB_PASSWORD='your-db-password' npx tsx scripts/setup-supabase.ts
//   # or
//   npx tsx scripts/setup-supabase.ts 'your-db-password'
//
// The DB password is the one set at Supabase → Project Settings → Database
// (NOT your Supabase dashboard login). Reset it there if you forgot it.
import * as fs from "fs";
import * as path from "path";
import { execSync } from "child_process";

const REF = "aycckjrkhgnwaggrrejp";
const REGION = "us-east-1"; // confirmed via GeoIP of db.<ref>.supabase.co
const DB_USER = `postgres.${REF}`;
const DB_NAME = "postgres";
const POOLER_HOST = `aws-0-${REGION}.pooler.supabase.com`;

const password = process.argv[2] || process.env.SUPABASE_DB_PASSWORD || "";
if (!password) {
  console.error(
    "Missing DB password.\nRun: SUPABASE_DB_PASSWORD='...' npx tsx scripts/setup-supabase.ts"
  );
  process.exit(1);
}

// URL-encode the password so special chars (@ : / # ?) are safe.
const encoded = encodeURIComponent(password);
const directUrl = `postgresql://${DB_USER}:${encoded}@${POOLER_HOST}:5432/${DB_NAME}`;
const pooledUrl = `postgresql://${DB_USER}:${encoded}@${POOLER_HOST}:6543/${DB_NAME}?pgbouncer=true`;

const envPath = path.join(process.cwd(), ".env");
let env = fs.existsSync(envPath) ? fs.readFileSync(envPath, "utf8") : "";

function setKey(key: string, val: string) {
  const line = `${key}=${JSON.stringify(val)}`;
  const re = new RegExp(`^${key}=.*$`, "m");
  if (re.test(env)) env = env.replace(re, line);
  else env = env.replace(/\s*$/, "\n" + line + "\n");
}

setKey("DATABASE_URL", pooledUrl);
setKey("DIRECT_URL", directUrl);
fs.writeFileSync(envPath, env);

// Also expose to child processes spawned below.
process.env.DATABASE_URL = pooledUrl;
process.env.DIRECT_URL = directUrl;

console.log("✓ Wrote DATABASE_URL (pooler 6543) and DIRECT_URL (session 5432) to .env");
console.log(`  host: ${POOLER_HOST}  project: ${REF}  region: ${REGION}`);

console.log("\n▶ Applying Prisma schema (prisma migrate deploy)…");
execSync("npx prisma migrate deploy", { stdio: "inherit" });

console.log("\n▶ Provisioning demo accounts (Evgenia + Jasmel)…");
execSync("npx tsx scripts/create-accounts.ts", { stdio: "inherit" });

console.log(
  "\n✓ Done. Set DATABASE_URL / DIRECT_URL / NEXT_PUBLIC_APP_URL in Vercel (or GitHub)\n" +
  "  and login with evgenia@jasmiamimethod.com / 123456789 and jasmel@jasmiamimethod.com / 12345679."
);
