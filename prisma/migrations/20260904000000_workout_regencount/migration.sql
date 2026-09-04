-- Workout regeneration counter (athlete may regenerate up to 3 times).
ALTER TABLE public."Workout" ADD COLUMN IF NOT EXISTS "regenCount" INTEGER NOT NULL DEFAULT 0;
