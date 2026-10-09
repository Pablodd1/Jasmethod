import { ApiError } from "./access";
import { nativeDeviceCapabilities } from "./native-device-capabilities";
import { buildAppleWorkoutExport } from "./apple-workout-export";
import type { CanonicalSession } from "./canonical-session";

/** Dependency boundary keeps tenant/revision/disabled behavior executable in tests. */
export async function resolveAppleExport(req: Request, dependencies: {
  access: () => Promise<{ actor: { id: string }; athlete: { id: string } }>;
  resolve: (athleteId: string, sessionId: string) => Promise<{ canonical: CanonicalSession } | null>;
  env?: Record<string, string | undefined>;
}) {
  const { actor, athlete } = await dependencies.access();
  if (actor.id !== athlete.id) throw new ApiError("Export your own workout for your paired Apple Watch.", 403);
  if (!nativeDeviceCapabilities(dependencies.env).apple.exportEnabled) throw new ApiError("Apple Watch companion export is not enabled. Native installation and device validation are still required.", 503);
  const params = new URL(req.url).searchParams;
  const sessionId = params.get("sessionId");
  const revision = params.get("expectedRevision");
  if (!sessionId || sessionId.length > 200 || !revision || revision.length > 200) throw new ApiError("Provide a workout and its current revision.", 400);
  const resolved = await dependencies.resolve(athlete.id, sessionId);
  if (!resolved) throw new ApiError("Workout not found.", 404);
  const { canonical } = resolved;
  if (canonical.athleteId !== athlete.id) throw new ApiError("Workout not found.", 404);
  if (canonical.id !== sessionId) throw new ApiError("Workout not found.", 404);
  if (canonical.revision !== revision) throw new ApiError("Your workout changed. Refresh the plan and export the current version.", 409);
  return buildAppleWorkoutExport(canonical);
}
