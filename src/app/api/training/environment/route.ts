import { appMutationOriginAllowed } from "@/lib/request-origin";
import { trainingAccess, ApiError } from "@/lib/access";
import { prisma } from "@/lib/db";
import { dateKey } from "@/lib/dates";
import { rateLimit } from "@/lib/ratelimit";
import { readScenarioJson, scenarioError, SCENARIO_HEADERS } from "@/lib/race-scenario-http";
import { assessDailyEnvironment } from "@/lib/daily-environment";
import { readDailyEnvironment, parseDailyEnvironmentCommand, prepareDailyEnvironment, saveDailyEnvironment } from "@/lib/daily-environment-store";
export const dynamic = "force-dynamic";
export async function GET(req: Request) {
  try {
    const { athlete } = await trainingAccess(req);
    const sessionId = new URL(req.url).searchParams.get("sessionId");
    if (!sessionId || !/^[a-zA-Z0-9_-]{1,128}$/.test(sessionId)) throw new ApiError("A valid sessionId is required.");
    const [workout, saved] = await Promise.all([
      prisma.workout.findFirst({ where: { id: sessionId, userId: athlete.id }, select: { date: true, startTime: true } }),
      readDailyEnvironment(athlete.id, sessionId),
    ]);
    if (!workout) throw new ApiError("Session not found", 404);
    return Response.json({ environment: assessDailyEnvironment({ ...saved, athleteId: athlete.id, sessionId, dateLocal: dateKey(workout.date, athlete.timezone), timezone: athlete.timezone, startTime: workout.startTime }) }, { headers: SCENARIO_HEADERS });
  } catch (error) { return scenarioError(error); }
}
export async function POST(req: Request) {
  try {
    const { actor, athlete } = await trainingAccess(req);
    if (!appMutationOriginAllowed(req)) throw new ApiError("Confirm venue details from this application only.", 403);
    if (req.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json") throw new ApiError("Expected JSON", 415);
    if (!rateLimit(`daily-environment:${actor.id}`, 12, 60000).ok) throw new ApiError("Please wait before updating the venue again.", 429);
    const command = parseDailyEnvironmentCommand(await readScenarioJson(req, 4096));
    const scope = { actorId: actor.id, athleteId: athlete.id, timezone: athlete.timezone };
    const prepared = await prepareDailyEnvironment(command, scope);
    const environment = await prisma.$transaction(tx => saveDailyEnvironment(tx, command, scope, prepared), { isolationLevel: "Serializable" });
    return Response.json({ environment }, { headers: SCENARIO_HEADERS });
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "P2034") return scenarioError(new ApiError("Workout or venue changed concurrently. Reload before saving.", 409));
    return scenarioError(error);
  }
}
