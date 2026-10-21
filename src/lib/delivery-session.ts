import type { Prisma } from "@prisma/client";
import { currentOrReportedWorkoutWhere, currentWorkoutWhere } from "./calendar-workouts";

/** Re-read the current owner plan at each delivery boundary. Historical actuals
 * remain addressable for feedback, but cannot become current instructions. */
export async function readDeliveryWorkout(db: Pick<Prisma.TransactionClient, "trainingPlan" | "workout">,
  userId: string, sessionId: string, preserveReports = false) {
  const active = await db.trainingPlan.findFirst({ where: { userId, status: "active" }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], select: { id: true } });
  return db.workout.findFirst({ where: { id: sessionId, AND: [
    preserveReports ? currentOrReportedWorkoutWhere(userId, active?.id ?? null) : currentWorkoutWhere(userId, active?.id ?? null),
  ] } });
}
