# Actionable JMM evidence audit

Baseline inspected read-only: main `3be1c623ffc4161d3d4233cdebe483a4e5c1e46d`, 11 October 2026.

## Findings ready to use

The expanded matrix contains 45 reviewed entries, with separate machine-readable counts for actual sessions, source-verified main sets, and non-session frameworks. A main set with verified work/rest is not the same as a fully validated athlete-specific prescription. The review includes negative findings and research-only sessions rather than recommending every published intervention.

The clearest additions are:

1. [Running 10-20-30 blocks](https://pubmed.ncbi.nlm.nih.gov/22556401/): a different structure from the existing generic aerobic-power template. Preserve five complete 60-second cycles per block and two-minute between-block rests. An effort-based JMM version must label its departure from the original maximal-intensity anchors.
2. [Cycling 8 × 60 s / 75 s recovery](https://experts.mcmaster.ca/scholarly-works/1339728): distinct from the current 30-second capacity recipe. The study’s ramp-test peak power is not FTP. Without that verified anchor, the runtime version must be an explicitly effort-adapted coaching choice.
3. [Seiler cycling 4 × 8 min](https://pubmed.ncbi.nlm.nih.gov/21812820/): source methods specify two-minute recoveries and a fifteen-minute warm-up. The separate 4 × 16 arm used three-minute recoveries. Do not copy a single online rest rule across every arm, or equate observed HR with a validated FTP target.
4. [Rønnestad cycling short and long intervals](https://onlinelibrary.wiley.com/doi/10.1111/sms.13627): complete grouping and recoveries are now source-verified. The short main set is 34.5 minutes; the long main set 27.5 minutes. Original cyclists had substantial training history and supervision. A simple repeated 30/15 selector is only a partial analogue.

These are candidates for the implementation owner’s gated, separately tested templates. This research task did not change application code or athlete records and does not assert that the candidate additions are deployed.

## Baseline mapping

- `src/lib/protocols.ts`: eight executable adaptation templates. Their exact prescriptions are deliberately labeled JMM choices. These should remain; citations do not convert them into exact research replications.
- `src/lib/prescription.ts`: legacy intervals include 30/15, 80/160, 3 min/3 min, sweet spot and 20-minute threshold patterns. Their existence is not full-dose source validation. Generic HYROX structure also exists.
- `src/lib/sprint-protocols.ts` and `src/data/sprints_protocols.json`: a separate sprint library and selection path. Its entry count cannot be used as evidence that each source/session has been freshly verified.
- `src/lib/reviewed-cycle-samples.ts`: explicitly synthetic, review-only examples with no automatic prescription and no qualified-coach approval. Ten cycles and 26 structures from earlier work are not ten shipped plans or 26 newly validated workouts.
- `src/lib/protocol-eligibility.ts`: adult/injury/history/goal gates exist. A general experience label alone does not establish modality-specific sprint, swimming, heavy-lift or double-session readiness.
- `src/lib/reviewed-evidence.ts`: claim eligibility means explanatory support, not dose authority. Preserve that distinction.

## Material evidence corrections

- Heavy strength can support running, but the [female endurance-athlete trial](https://pubmed.ncbi.nlm.nih.gov/26953893/) did not improve its running-performance or economy outcomes despite strength gains. Do not promise every lifting block makes athletes faster.
- The [swimming HIIT trial](https://journals.plos.org/plosone/article?id=10.1371/journal.pone.0095025) did not demonstrate superiority for its tested elite swimming outcomes. No universal replacement of swimming volume with intervals follows.
- [Supramaximal running in trained women](https://onlinelibrary.wiley.com/doi/full/10.1111/sms.14470) included a substantial injury signal in the 10 × 30-second arm. Aerobic fitness is insufficient evidence of maximal-sprint tolerance.
- [Boxing’s 2026 correction](https://www.frontiersin.org/journals/sports-and-active-living/articles/10.3389/fspor.2026.1925581/full) concerns image/AI disclosure, not a changed scientific dose. However, a rounded ten-minute block label should not replace the exact work/rest arithmetic.
- A newly inspected [rugby paper](https://www.frontiersin.org/journals/physiology/articles/10.3389/fphys.2025.1620197/full) has conflicting text/table rest and set prescriptions and an inconsistent six/eight-week description. It was excluded from the verified workout count and should not be operationalized without clarification.

## Huberman, Galpin and research credentials

The official [strength](https://www.hubermanlab.com/episode/dr-andy-galpin-optimal-protocols-to-build-strength-and-grow-muscles) and [endurance](https://www.hubermanlab.com/episode/dr-andy-galpin-how-to-build-physical-endurance-and-lose-fat) episodes were checked again. They are expert teaching; the transcripts warn of possible errors, including apparent speaker-label problems. Retain chapter references, distinguish the speaker from the evidence author, and never label their entire menu as a randomized trial.

The prior six-episode, 21-claim/26-source dossier remains useful. It distinguishes actual Huberman-authored breathing research from recovery claims and actual Galpin-coauthored studies from his educational discussion. This pass does not claim to re-extract every prior source. Academic “Dr.” does not make an episode individualized medical care or confer endorsement of JMM.

## Required implementation checks

Separate original source dose, adapted app dose, population and limitations. Require sport-appropriate prior tolerance, current health/readiness and sufficient time. Never infer missing PPO/MAS/HRmax or use FTP as a substitute. Preserve full work bouts and recoveries; reject a too-short budget or explicitly choose a different named adaptation. Aggregate quality load across sports. Keep research-only and unavailable entries visibly separate from selectable recipes. Preserve preview/apply authorization, audit history, canonical export consistency and completed-session protection.

The exact Sisu-specific coverage and remaining access limit are documented separately. This deliverable does not claim 30 inspected Sisu workouts.
