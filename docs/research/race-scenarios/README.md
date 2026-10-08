# Race planning: evidence and evaluation

The engine remains a **selected-target scenario planner**, not a validated estimate of athletic capacity. No forecast gate is enabled by this work.

## Research record (8 October 2026)

- [Comparative audit](comparative-audit.md): 10 repositories and 9 commercial products; source/license findings, limitations and prioritized follow-up.
- [Candidate inventory](candidate-inventory.json): pinned revisions and source records supporting that audit.
- [Prediction validity audit](prediction-validity-audit.md): what the equations can and cannot establish; data and held-out evaluation requirements.
- [Evaluation protocol](evaluation-protocol.md): isolated evaluation contract and a proposed path to real-race validation.

The audits are historical records of the inspected PR #35 head. Their statements about checks not rerun, corrections not yet applied and development status describe that audit, not a claim about the current branch. Main subsequently includes PR #35 and planning setup PR #36. Merging is not proof of production deployment. Existing foundational research in this directory is retained.

## Bounded follow-through

- Workspace copy explicitly separates chosen effort from race-day capacity and prompts duration, maximal/easy effort and fresh/post-bike context. These are reference notes, not a new validated applicability model.
- Kilometer/mile execution splits re-bin the existing calculated segment times. They do not optimize effort, change the target or infer fitness. A partial final split is retained. Cumulative rounding makes displayed/CSV split seconds sum to the displayed leg total. CSV contains only numeric distances/times with fixed headers; it excludes identity and free text.
- Splits use the existing continuous calculation segments. They do not fill route gaps, add stops or transition time, or bypass course validation. A saved historical output with inconsistent duration/segments yields no split table.
- The evaluation harness has synthetic correctness fixtures only. It is not an empirical JMM accuracy study, a fitted model, an athlete-data ingestion route or a release approval.

No athlete dataset, new external dependency, copied third-party implementation, database migration, forecasting model, production deployment or notification is introduced. Actual predictive validity still requires consented pre-race records, preregistered criteria and independent held-out/prospective outcomes.
