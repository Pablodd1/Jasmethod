-- Actual race result (minutes) for prediction-accuracy tracking.
ALTER TABLE public."Race" ADD COLUMN IF NOT EXISTS "resultMin" DOUBLE PRECISION;
