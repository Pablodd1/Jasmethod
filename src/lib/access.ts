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

// Pure gate for tests: does this assignment row grant access?
export function assignmentAllows(assignment: {
  status: string;
  consent: string;
} | null): boolean {
  if (!assignment) return false;
  if (assignment.status !== "active") return false;
  return assignment.consent === "granted";
}

// Cross-athlete health-data access: admin = platform owner (all athletes);
// coach = only athletes with an active, non-revoked assignment.
export async function canAccessAthlete(
  actor: { id: string; role: string },
  athleteId: string,
): Promise<boolean> {
  if (actor.role === "admin") return true;
  if (actor.role !== "coach") return false;
  const assignment = await prisma.coachAssignment.findUnique({
    where: { coachId_athleteId: { coachId: actor.id, athleteId } },
    select: { status: true, consent: true },
  });
  return assignmentAllows(assignment);
}

// Explicit per-request scope. It never changes the administrator's login/session.
export async function trainingAccess(req?: Request) {
  const actor = await getCurrentUser();
  if (!actor) throw new ApiError("Sign in to continue", 401);
  const target = req ? new URL(req.url).searchParams.get("athleteId") : null;
  if (target && target !== actor.id) {
    if (!canCoach(actor))
      throw new ApiError("Administrator access required", 403);
    if (!(await canAccessAthlete(actor, target)))
      throw new ApiError("This athlete is not assigned to you", 403);
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
