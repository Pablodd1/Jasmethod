-- Race venue coordinates for weather (Open-Meteo) and maps.
ALTER TABLE public."Race" ADD COLUMN IF NOT EXISTS "lat" DOUBLE PRECISION;
ALTER TABLE public."Race" ADD COLUMN IF NOT EXISTS "lng" DOUBLE PRECISION;
