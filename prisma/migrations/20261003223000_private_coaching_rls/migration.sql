-- These tables contain private conversations, contact details, and reply tokens.
-- Match the existing server-only tables: the Prisma owner bypasses RLS, while
-- browser roles have no policies and cannot read or mutate athlete records.
ALTER TABLE public."CommunicationPreference" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."CoachingPrompt" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."TelegramCoachingUpdate" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."CoachConversation" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."CoachConversationMessage" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."CoachConversationProposal" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."CoachConversationRequest" ENABLE ROW LEVEL SECURITY;
