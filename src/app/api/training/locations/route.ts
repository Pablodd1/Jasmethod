import { trainingAccess, ApiError } from "@/lib/access";
import { prisma } from "@/lib/db";
import { appMutationOriginAllowed } from "@/lib/request-origin";
import { rateLimit } from "@/lib/ratelimit";
import { readScenarioJson, scenarioError, SCENARIO_HEADERS } from "@/lib/race-scenario-http";
import { DAILY_ENVIRONMENT_ACTION } from "@/lib/daily-environment-store";
import { readDailyEnvironmentRecord } from "@/lib/daily-environment";
import { isTrainingLocation, locationSearchInput, searchTrainingLocations, type TrainingLocation } from "@/lib/training-location";
export const dynamic = "force-dynamic";
export async function GET(req: Request) {
  try {
    const { athlete } = await trainingAccess(req);
    const rows = await prisma.auditLog.findMany({ where: { subjectId: athlete.id, action: DAILY_ENVIRONMENT_ACTION }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 40, select: { entityId: true, after: true } });
    const locations: TrainingLocation[] = [];
    for (const row of rows) {
      const c = row.entityId ? readDailyEnvironmentRecord(row.after, athlete.id, row.entityId) : null;
      const location = c && { label: c.venueName, latitude: c.latitude, longitude: c.longitude, timeZone: c.timeZone };
      if (c?.venueConfirmed && isTrainingLocation(location) && !locations.some(l => l.label === location.label && l.latitude === location.latitude && l.longitude === location.longitude)) locations.push(location);
      if (locations.length === 8) break;
    }
    return Response.json({ locations }, { headers: SCENARIO_HEADERS });
  } catch (error) { return scenarioError(error); }
}
export async function POST(req: Request) {
  try {
    const { actor } = await trainingAccess(req);
    if (!appMutationOriginAllowed(req)) throw new ApiError("Search from this application only.", 403);
    if (req.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json") throw new ApiError("Expected JSON", 415);
    if (!rateLimit(`training-location:${actor.id}`, 12, 60000).ok) throw new ApiError("Please wait before searching again.", 429);
    let query: string;
    try { query = locationSearchInput(await readScenarioJson(req, 1024)); } catch { throw new ApiError("Enter a city, state/region or postal code (2–120 characters)."); }
    try { return Response.json({ locations: await searchTrainingLocations(query) }, { headers: SCENARIO_HEADERS }); }
    catch { throw new ApiError("Location search is unavailable. You can continue without weather.", 503); }
  } catch (error) { return scenarioError(error); }
}
