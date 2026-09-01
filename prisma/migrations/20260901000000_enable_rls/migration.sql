-- Enable Row Level Security on every public table WITHOUT adding policies.
-- The app (Prisma) connects as the table owner via the direct connection
-- string, and owners bypass RLS by default — so app behavior is unchanged.
-- What this fixes: Supabase exposes `public` to PostgREST (the auto REST API
-- keyed by the anon/public key). With RLS enabled and zero policies, that API
-- can no longer read or write any row — closing the Security Advisor errors.
-- NOTE: intentionally NOT using `FORCE ROW LEVEL SECURITY`, which would apply
-- RLS to the owner and break Prisma.
ALTER TABLE public."AthleteProfile" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."AuthSession" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."BenchmarkTest" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."BloodPanel" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."BloodResult" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."CalendarEvent" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."CognitiveTest" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."Connector" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."DailyCheckin" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."DailyMetrics" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."GeneticResult" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."GeneticVariant" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."HydrationLog" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."MotivationPref" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."NutritionLog" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."PlanDay" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."Race" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."ReminderPref" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."SentEmail" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."SleepRecord" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."SupplementProfile" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."TrainingPlan" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."User" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."Workout" ENABLE ROW LEVEL SECURITY;
-- Prisma internal state table: no policies = fully blocked via the public API.
ALTER TABLE public._prisma_migrations ENABLE ROW LEVEL SECURITY;
