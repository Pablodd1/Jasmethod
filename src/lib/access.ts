import { getCurrentUser } from "./auth";
import { prisma } from "./db";

export class ApiError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}
export const canCoach = (user: { role: string }) =>
  user.role === "admin" || user.role === "coach";

// Explicit per-request scope. It never changes the administrator's login/session.
export async function trainingAccess(req?: Request) {
  const actor = await getCurrentUser();
  if (!actor) throw new ApiError("Sign in to continue", 401);
  const target = req ? new URL(req.url).searchParams.get("athleteId") : null;
  if (target && target !== actor.id) {
    if (!canCoach(actor))
      throw new ApiError("Administrator access required", 403);
    const athlete = await prisma.user.findUnique({
      where: { id: target },
      include: { profile: true, motivation: true },
    });
    if (!athlete) throw new ApiError("Athlete not found", 404);
    return { actor, athlete };
  }
  return { actor, athlete: actor };
}

export function errorResponse(error: unknown) {
  const status = error instanceof ApiError ? error.status : 500;
  if (status === 500) console.error(error);
  return Response.json(
    {
      error:
        status === 500
          ? "Could not save changes. Please retry."
          : (error as Error).message,
    },
    { status },
  );
}
