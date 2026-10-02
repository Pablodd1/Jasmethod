-- New accounts default to English (was Spanish); onboarding language picker still applies.
ALTER TABLE "User" ALTER COLUMN "language" SET DEFAULT 'en';
