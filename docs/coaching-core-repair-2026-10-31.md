# Coaching core repair — engineering brief and evidence

## Objective

Repair the existing coaching pipeline before adding another questionnaire or AI layer. The athlete's saved goal, dated recent capacity, availability and events must produce a reviewable cycle, a reloadable saved schedule, an executable daily prescription and a consistent export. A completed workout requires an actual report. Preserve the existing alternative screens.

## Work assignments

- Training core: triathlon distance/level dispatch, separate swim/bike/run bouts, capacity/day limits, preserved session purpose, single-sport/HYROX scheduling.
- Athlete flow: independent saved-plan loading, optional legacy metadata recovery, validated preview/save acknowledgments, result-entry route.
- Coach: wide standalone conversation, reduced persistent controls, relevant protected inline tools, existing embedded view retained.
- Integration: current-anchor numerical target projection, mechanical work and speed units, privacy, science review, full verification and release.

## Confirmed causes

1. Only advanced/pro half-distance plans used the reviewed triathlon template. Other reviewed triathlon requests could allocate a whole week's swimming to one bout.
2. Cycle shaping replaced authored session purpose with generic descriptions.
3. Optional audit metadata could invalidate an otherwise valid saved schedule.
4. The client accepted an arbitrary successful HTTP response as a saved plan.
5. A shortcut marked a session completed without opening actual duration, effort or notes.
6. Fixed template weekday slots could produce empty single-sport/HYROX weeks for real athlete availability.

## Acceptance contract

- Test sprint, Olympic, half and full triathlon across four experience levels and multiple reported capacities. Separate sport bouts fit weekly and daily budgets, rest days and explicit double-day agreement. No catch-up for event/protected/completed days.
- Test single-sport and HYROX availability across weekday offsets. An infeasible schedule is explained, never represented as completed generation.
- Preserve useful purpose and complete work/recovery structure; reductions must not retain contradictory threshold instructions.
- Store relative prescriptions. Resolve current dated FTP/CSS/run/HR evidence at read/export boundaries; never freeze stale profile-derived absolute targets into the saved plan.
- Missing anchors retain supported effort guidance. Missing physiology is not estimated from age, sex or a goal time. Optional comfortable observation does not become a maximal test.
- Numerical targets, units and source/date remain inspectable. Mechanical cycling work uses watts × timed seconds / 1,000, and is a planned range, not measured work or nutritional calories. Do not infer bike speed from watts or HR.
- Only explicit validated sport structures may define bricks, pool lengths, strokes, station loads and transitions. A text description is insufficient for a three-leg export.
- Optional legacy review metadata cannot hide valid sessions. Malformed executable structure remains blocked. Saving requires a real backend acknowledgment and reload.
- Result logging opens the existing owned-session form with actual duration, effort, notes and optional weight. Existing downstream adaptation consumes reported training; weights inform hydration, not invented capacity.
- Standalone Coach fills the available window; composer remains visible and optional controls collapse. Protected owner-scoped cards remain usable. Text and voice retain identical permissions.
- Device/imported information and derived summaries never enter external AI or Telegram. Do not change credentials, provider permissions or real athletes' saved plans during tests.

## Evidence review (31 October 2026)

This repair uses bounded coaching rules, not a scientifically validated response optimizer. A nine-week randomized study in 48 trained endurance athletes found benefits from polarized training in its studied population; it does not prove a universal ratio or dose for novices, HYROX or every triathlon distance. JMM must distinguish its coaching defaults from trial protocols. [Original study](https://www.frontiersin.org/journals/physiology/articles/10.3389/fphys.2014.00033/full).

TrainingPeaks documents true structured workouts with distance/time and power, HR, pace or perceived effort. This supports the product requirement that a workout be executable rather than title-only; it does not validate JMM's physiological decisions. [Official builder documentation](https://help.trainingpeaks.com/hc/en-us/articles/235164967-Structured-Workout-Builder).

### Ranked reference projects for this task

Ranked by relevance to the repair and source authority, not popularity. No source code imported and no new dependency added.

1. **Garmin FIT JavaScript SDK** — first-party encoding/decoding reference, a test directory and published format semantics. Best reference for export verification, not a coaching engine. Its SDK license must be reviewed for any new reuse. [Repository](https://github.com/garmin/fit-javascript-sdk).
2. **GoldenCheetah** — endurance/triathlon analysis, Critical Power, workload models, import/export; repository includes test/unittest directories. Useful model/analysis reference, GPL-2.0 licensing and a desktop C++ architecture prevent treating it as a drop-in web coaching service. [Repository](https://github.com/GoldenCheetah/GoldenCheetah).
3. **wger** — workout, nutrition and weight tracking; useful strength-log/API product reference. AGPL-3.0, Django architecture, and no demonstrated individualized triathlon optimizer in the reviewed material. [Repository](https://github.com/wger-project/wger).

## Release evidence

Local: 2,167 tests passed; typecheck passed; lint passed with three existing hook warnings. The Windows `npm run build` entry point hit a locked Prisma DLL (`EPERM`); a Next production compilation using the unchanged generated client and the full clean CI build remain required release gates.

| Capability | Actual scope |
| --- | --- |
| Cycle generation | Bounded rules using reviewed goal, recent tolerated minutes, availability, dated anchors, event and performed-day constraints. No validated response or finish-time optimizer. |
| Numerical workout targets | Current evidenced sport references; future projection respects expiry. Missing references use effort guidance. Generic sport labels cannot invent HR thresholds or station loads. |
| Cycling kJ | Planned mechanical power × timed duration range. Unknown power/time stays unavailable. No automatic conversion to food calories. |
| Result feedback | Existing owned-session form, actual minutes/effort/notes and optional weights. No empty one-click completed report. |
| Conversation | Wide text/voice UI, reviewed local proposals and protected record cards. Fixed educational follow-ups. Optional external prose is not given biometric/app history. |
| Triathlon export | Existing explicit ordered component/transition structures remain supported within their validated scope. A generated generic swim is not an explicit pool workout or three-leg rehearsal. |
| Device delivery | Existing integration state/receipts govern. This repair does not establish physical watch delivery or expand Garmin permissions. |
| No training history | Existing comfortable initial assessment path; no guessed FTP, CSS, volume or automatic maximal battery. |

Pending: final isolated PostgreSQL/browser regression, automated PR review, exact-head release and live read-only smoke. Synthetic scenarios cannot establish physical device delivery or a real athlete's training response. Existing saved plans require an explicitly reviewed replacement; this release must not rewrite them automatically.
