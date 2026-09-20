-- Track whether the athlete completed first-time onboarding.
ALTER TABLE public."User" ADD COLUMN IF NOT EXISTS "onboarded" BOOLEAN NOT NULL DEFAULT false;
