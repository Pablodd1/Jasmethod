-- KCoach activity reports: narrative generated at sync from the athlete's own
-- history. NULL = report not yet generated (planned sessions never carry one).
ALTER TABLE "Workout" ADD COLUMN "insights" TEXT;
