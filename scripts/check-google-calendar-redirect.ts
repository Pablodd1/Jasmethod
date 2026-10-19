/**
 * Offline check of the Google OAuth redirect configuration (Calendar connection and Google sign-in).
 *
 *   npm run check:google-calendar -- --registered-file uris.txt
 *   npm run check:google-calendar -- --env-file .env.production.local --registered "<uri>,<uri>"
 *
 * Makes no network request, changes no setting and prints no secret. All logic lives in
 * src/lib/oauth-redirect-check.ts, where it is unit-tested; this file only wires the process.
 */
import { readFileSync } from "node:fs";
import { runRedirectCheck } from "../src/lib/oauth-redirect-check";

const run = runRedirectCheck(process.argv.slice(2), process.env, (path) => readFileSync(path, "utf8"));
if (run.stdout) console.log(run.stdout);
if (run.stderr) console.error(run.stderr);
process.exit(run.exitCode);
