-- RLS parity for the connector-upgrade tables: OAuthTransaction and
-- WebhookEvent were created without it while every other table has it
-- enabled. Same pattern as 20260901000000_enable_rls (ENABLE only — FORCE
-- would apply to the owner and break Prisma).
ALTER TABLE public."OAuthTransaction" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."WebhookEvent" ENABLE ROW LEVEL SECURITY;
