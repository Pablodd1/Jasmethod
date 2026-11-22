# AI Developer Upgrade Handoff — JasMiamiMethod

## What Was Changed (Branch: `science-v2-shadow`, Commit `49d309f`)
- **Added `public/llms.txt`**: Concise, factual AI-crawler index for LLMO/GEO discovery.
- **Updated `src/app/robots.txt/route.ts`**: Explicitly allows AI answer crawlers (`GPTBot`, `OAI-SearchBot`, `ChatGPT-User`, `PerplexityBot`, `ClaudeBot`, `Google-Extended`, `Applebot-Extended`).
- **Added `src/components/posthog-analytics.tsx` & wired in `src/app/layout.tsx`**: Optional PostHog funnel/analytics component (safely no-op when env vars are unset) + `<link rel="help" type="text/plain" href="/llms.txt" />`.

## Live Test Findings & Developer Actions Needed
1. **Merge to production branch**: Live check on `https://jasmiamimethod.fit/llms.txt` returned `404` because production deploys from `main`, while this upgrade is on `science-v2-shadow`. Merge `science-v2-shadow` into `main` when ready.
2. **Optional Analytics Activation**: Set `NEXT_PUBLIC_POSTHOG_KEY` and `NEXT_PUBLIC_POSTHOG_HOST` in Vercel (or point to Umami at `https://umami-production-92f6d421.up.railway.app`).
3. **Pre-existing Local Test Note**: 2 tests in `auth-security.test.ts` fail locally when `.env` sets `localhost:3200` instead of `localhost` (unrelated to this upgrade; 367/369 tests pass).
