> **CTO audit update — 2026-10-20:** New regression and real-PostgreSQL acceptance run in the existing PR CI; the original environment limitations and counts below are historical. New stream suggestions require `ENABLE_SMART_COACH_SUGGESTIONS=1` (default off), the same sport, non-reduced streams and external power for fade. Detected efforts are not verified completion. Every hard-time increase, higher zone or shorter recovery requires confirmation.

# Smart Coach pilot: interval edits, revision history, activity analysis

Branch `feat/jmm-connectivity-smart-coach`, 2026-10-20. Pilot scope, **not** the full 13-phase Smart Coach 2.0 brief
(its text was truncated when received; see "Not built"). Nothing here is deployed, the migration is **not applied**,
and storage of second-by-second data is **off** unless the operator sets `ENABLE_ACTIVITY_STREAMS=1`.

## What the coach is

A conversational *interface* to the engine JMM already has. It never invents a workout, a number or a delivery.
There is still exactly one canonical workout record and one writer.

```
athlete says "make it 5 x 4 min, 2 min rest"
  → parseIntervalRequest      (deterministic EN/ES patterns, no model; vague requests become questions)
  → applyIntervalPatch        (pure: new explicit steps + before/after preview + limit checks)
  → POST /api/workout/interval-edit   mode "preview"   (nothing written)
  → athlete confirms (a second explicit confirmation if the change raises load)
  → POST /api/workout/interval-edit   mode "apply"     (re-derives the steps on the server; never trusts client steps)
  → PATCH /api/workout/card   (the EXISTING writer: athlete scope, serializable transaction,
                               approval cleared, AuditLog before/after)
  → athlete approves again    (unchanged approve route; the approval is bound to the new revision)
  → export / email / Telegram / Intervals (unchanged, revision-bound guards)
```

| Piece | File | Tests |
|---|---|---|
| Parser, preview, limits | `src/lib/workout-interval-edit.ts` | `workout-interval-edit.test.ts` (20) |
| Revision history, approval status, undo eligibility | `src/lib/workout-history.ts` | `workout-history.test.ts` (8) |
| Deterministic stream analysis | `src/lib/stream-analysis.ts` | `stream-analysis.test.ts` (16, hand-computed answers) |
| Next-workout proposal | `src/lib/next-workout-suggestion.ts` | `next-workout-suggestion.test.ts` (8) |
| Stream storage policy | `src/lib/activity-stream-store.ts` | `activity-stream-store.test.ts` (12) |
| UI (editor, history, suggestion, analysis, consent, delete) | `IntervalCoachEditor.tsx`, `activity-streams.tsx` | `smart-coach-ui.test.ts` (4) |
| Routes | `api/workout/interval-edit`, `api/workout/history`, `api/workout/next-suggestion`, `api/activity-analysis`, `api/activity-streams` | DB-bound: not executable here (see report) |

## Safety rules the code enforces

- **Direction rule.** Load-reducing edits need the athlete's normal confirmation. Edits that **raise** load (higher
  work zone, any increase in Z4+ time, shorter recovery or added duration) return `requiresConfirmation` and the server refuses
  to apply them without `confirmed: true`. A suggestion that raises load always requires it.
- **Caps.** The work zone can never exceed today's check-in intensity cap (an unknown cap means no raises), is never
  raised above Z5 from chat, the workout never exceeds its reviewed time budget, and never exceeds the 50-step device
  limit. Repeats 1–30, work 10 s–60 min, rest 5 s–30 min.
- **Safety holds are not touched.** The card PATCH refuses non-`ready` sessions, recorded/past/rest-day sessions,
  protocol and double-day sessions. Future sessions are held by the existing "same-day check-in" doctrine, so an edit
  becomes possible on the session day after the check-in. The next-workout proposal is therefore shown *inside that
  day's editor*, not applied in advance.
- **Ambiguity is refused.** "Make it easier" is not turned into a number. Several equal-sized sets, non-uniform
  sets, distance/rep/lap steps and sets with no rest to copy are refused with a reason.
- **Profile-derived targets are never frozen** into the saved prescription (only author-set explicit targets are kept).
- **No silent send.** Applying an edit clears approval. Nothing is exported or sent to a watch, calendar, email or
  Telegram by this feature.

## Analysis: formulas and limits

Normalized power = 4th root of the mean 4th power of the 30-s rolling mean (needs ≥ 20 min with ≥ 80% power
coverage); IF = NP/FTP; TSS = duration × NP × IF / (FTP × 3600) × 100; aerobic decoupling = (EF₁ − EF₂)/EF₁ with
EF = output/HR per half (steady effort ≥ 40 min, ≥ 90% coverage, rolling output CV ≤ 15%; speed is used for runs
without power; the recording is split at its midpoint, warm-up not removed). Zones use the **same factors as plan
targets** (`zone-factors.ts`). Hard efforts = ≥ 60 s sustained above the Z3 upper bound of the primary channel.

- Missing is `null`/"—", never 0: a power dropout is not 0 W; a recording gap longer than 10 s is never interpolated.
- **FTP** is the athlete's validated FTP only (a recent applied test, the repo's existing evidence rule). **LTHR is
  never treated as validated** by that rule (test records have no sport context), so heart-rate zones are not computed
  in production today; the analysis says so. Changing that is an owner/coach decision.
- Analysis uses the athlete's *current* validated FTP, not the FTP at the time of the activity (stated in the UI data).

## Next-workout proposal (JMM heuristics, need coach sign-off)

| Evidence | Proposal |
|---|---|
| Decoupling ≥ 8%, or fade ≥ 8% (first → last hard effort), or ≥ 2 fewer hard efforts than planned | one fewer repeat |
| Decoupling 5–8%, fade 4–8%, or 1 fewer effort than planned | hold, no change |
| All planned efforts done, fade < 3%, decoupling < 5% (or unknown) | +1 repeat, **explicit confirmation required** |
| Anything else / missing evidence | none |

These thresholds are common rules of thumb, **not validated prescriptions**. They are in `THRESHOLDS`
(`next-workout-suggestion.ts`).

## Second-by-second data policy

Opt-in at four levels: operator flag `ENABLE_ACTIVITY_STREAMS=1` (default off) → athlete ticks consent on that upload
→ origin must be known and not Strava → retention `ACTIVITY_STREAM_RETENTION_DAYS` (default 180, max 365). Data kept:
heart rate, power, cadence, speed, altitude, distance, at most 3,600 points per activity. **No GPS is ever read.**
Expired rows are invisible immediately; `purgeExpired` deletes them through the authenticated existing worker cron (including while storage is off). The athlete can delete one
activity or all of it from the Connectors page; deletion also works with the flag off. Deleting a workout or the
account cascades. Reads are scoped by athlete; a coach viewing an athlete receives no stream analysis.

## Owner actions before this can run

1. Review and apply `prisma/migrations/20261020120000_activity_streams/migration.sql` (additive: one table; rollback =
   `DROP TABLE "ActivityStream"`). It enables RLS with no policies like the other new tables; verify the deployed
   Prisma role can read/write it. **Not applied to production. Prisma validation now passes; migration behavior is tested only on the disposable CI PostgreSQL instance.**
2. Decide the consent text/retention with counsel (health data), then set `ENABLE_ACTIVITY_STREAMS=1`.
3. Verify the existing worker cron reports successful cleanup in the isolated environment before enabling collection. The cleanup implementation is included; this task changes no production cron or flags.
4. Coach sign-off on the thresholds above and on the LTHR policy.

## Not built (and why)

- Natural-language edits for swim, strength, brick, hyrox, distance/rep/lap steps (the card editor does not support them).
- Undo deeper than the latest step edit (the existing restore only reverts the latest edit).
- Free-form conversational dialogue; the pilot parses a fixed grammar and asks when unsure.
- Coach-facing views of an athlete's stream analysis (privacy decision).
- Phases of the original brief that were not received (truncated).
