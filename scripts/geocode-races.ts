// Backfill lat/lng for saved races that have a location but no coordinates.
// Run: DATABASE_URL=... npx tsx scripts/geocode-races.ts
import { PrismaClient } from "@prisma/client";
import { geocodeLocation } from "../src/lib/weather";

const prisma = new PrismaClient({ log: ["error"] });

(async () => {
  const races = await prisma.race.findMany({ where: { lat: null, location: { not: null } } });
  for (const r of races) {
    const g = await geocodeLocation(r.location!);
    if (g) {
      await prisma.race.update({ where: { id: r.id }, data: { lat: g.lat, lng: g.lng } });
      console.log(`${r.name} -> ${g.lat}, ${g.lng} (${g.label})`);
    } else {
      console.log(`${r.name} -> NOT FOUND ("${r.location}")`);
    }
  }
  await prisma.$disconnect();
})();
