CREATE TABLE "PreWorkoutWeight" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "workoutId" TEXT,
    "weightKg" DOUBLE PRECISION NOT NULL,
    "observedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "PreWorkoutWeight_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "PreWorkoutWeight_weightKg_check" CHECK ("weightKg" >= 20 AND "weightKg" <= 350)
);
CREATE UNIQUE INDEX "PreWorkoutWeight_workoutId_key" ON "PreWorkoutWeight"("workoutId");
CREATE INDEX "PreWorkoutWeight_userId_observedAt_idx" ON "PreWorkoutWeight"("userId", "observedAt");
ALTER TABLE "PreWorkoutWeight" ADD CONSTRAINT "PreWorkoutWeight_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PreWorkoutWeight" ADD CONSTRAINT "PreWorkoutWeight_workoutId_fkey" FOREIGN KEY ("workoutId") REFERENCES "Workout"("id") ON DELETE SET NULL ON UPDATE CASCADE;
