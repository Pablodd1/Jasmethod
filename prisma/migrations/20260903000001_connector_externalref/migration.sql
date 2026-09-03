-- Provider-side athlete id (Strava athlete_id) for webhook matching.
ALTER TABLE public."Connector" ADD COLUMN IF NOT EXISTS "externalRef" TEXT;
