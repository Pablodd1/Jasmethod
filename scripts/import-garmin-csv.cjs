// Import a Garmin Connect "Activities.csv" export for one athlete.
//   node scripts/import-garmin-csv.cjs <email> <path-to-Activities.csv>
// Idempotent: dedupes on externalId (garmin-csv:date:title), so re-running
// adds only new activities.
const fs = require("fs");
const path = require("path");
const { PrismaClient } = require("@prisma/client");

const envPath = path.join(process.cwd(), ".env");
if (fs.existsSync(envPath)) {
  const raw = fs.readFileSync(envPath, "utf8");
  for (const key of ["DATABASE_URL", "DIRECT_URL"]) {
    const line = raw.split("\n").find((l) => l.trim().startsWith(key + "="));
    if (line) process.env[key] = line.substring(line.indexOf("=") + 1).trim().replace(/^"|"$/g, "");
  }
}

const prisma = new PrismaClient({ log: ["error"] });

// Same parser contract as src/lib/importers.ts (kept in sync deliberately:
// CSV columns are stable in the Garmin export).
function csvSplit(line) {
  const out = [];
  let cur = "", inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') { if (inQ && line[i + 1] === '"') { cur += '"'; i++; } else inQ = !inQ; }
    else if (ch === "," && !inQ) { out.push(cur); cur = ""; }
    else cur += ch;
  }
  out.push(cur);
  return out;
}

(async () => {
  const [email, file] = process.argv.slice(2);
  if (!email || !file) { console.error("Usage: node scripts/import-garmin-csv.cjs <email> <Activities.csv>"); process.exit(1); }
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) { console.error("No user: " + email); process.exit(1); }

  const csv = fs.readFileSync(file, "utf8");
  const lines = csv.split(/\r?\n/).filter((l) => l.trim());
  const header = csvSplit(lines[0]).map((h) => h.trim());
  const idx = (name) => header.findIndex((h) => h === name);
  const iType = idx("Activity Type"), iDate = idx("Date"), iTitle = idx("Title"),
    iDist = idx("Distance"), iCal = idx("Calories"), iTime = idx("Time"),
    iAvgHr = idx("Avg HR"), iMaxHr = idx("Max HR"), iAvgPwr = idx("Avg Power"),
    iNP = header.findIndex((h) => h.startsWith("Normalized Power")),
    iTss = header.findIndex((h) => h.startsWith("Training Stress Score"));
  const num = (v) => {
    if (v == null) return null;
    const clean = v.replace(/,/g, "").replace(/^'-/, "-").replace(/'/g, "").trim();
    if (clean === "" || clean === "--") return null;
    const n = parseFloat(clean);
    return isNaN(n) ? null : n;
  };

  let imported = 0, skipped = 0;
  for (const line of lines.slice(1)) {
    const c = csvSplit(line);
    const type = (c[iType] || "").trim();
    const sport = /Swim/i.test(type) ? "swim" : /Cycling|Bike/i.test(type) ? "bike" : /Run|Jog|Walk/i.test(type) ? "run" : null;
    if (!sport) { skipped++; continue; }
    const dateStr = (c[iDate] || "").trim();
    const date = new Date(dateStr.replace(" ", "T"));
    if (isNaN(date.getTime())) { skipped++; continue; }
    const tm = (c[iTime] || "").trim().match(/^(\d+):(\d+):(\d+)/);
    if (!tm) { skipped++; continue; }
    const durationMin = Math.round((+tm[1] * 3600 + +tm[2] * 60 + +tm[3]) / 60);
    const rawDist = num(c[iDist]);
    const distanceKm = rawDist == null ? null : sport === "swim" ? Math.round((rawDist / 1000) * 100) / 100 : rawDist;
    const title = (c[iTitle] || type).trim();
    const externalId = `garmin-csv:${dateStr}:${title}`;
    const existing = await prisma.workout.findFirst({ where: { userId: user.id, externalId } });
    if (existing) { skipped++; continue; }
    await prisma.workout.create({
      data: {
        userId: user.id, date, sport, title, type: "endurance", durationMin,
        distanceKm: distanceKm ?? undefined,
        avgHr: num(c[iAvgHr]) ?? undefined, maxHr: num(c[iMaxHr]) ?? undefined,
        avgPower: num(c[iAvgPwr]) ?? undefined, np: num(iNP >= 0 ? c[iNP] : undefined) ?? undefined,
        tss: num(iTss >= 0 ? c[iTss] : undefined) ?? undefined,
        calories: num(c[iCal]) ?? undefined,
        planned: false, completed: true, source: "garmin", externalId,
      },
    });
    imported++;
    console.log(`+ ${dateStr} ${sport} ${title} (${durationMin} min${distanceKm ? ", " + distanceKm + " km" : ""})`);
  }
  console.log(`\nDone for ${email}: ${imported} imported, ${skipped} skipped (dupes/unsupported types).`);
  await prisma.$disconnect();
})().catch((e) => { console.error(e); process.exit(1); });
