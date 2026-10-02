-- Track where a prescription was published (Intervals.icu event id etc.)
-- so re-pushes update instead of duplicating.
ALTER TABLE "Workout" ADD COLUMN "deliveryProvider" TEXT;
ALTER TABLE "Workout" ADD COLUMN "deliveryId" TEXT;
