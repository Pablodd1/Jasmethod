# Recovery-day planning defaults

These are JMM product defaults for a **new, previewed and confirmed plan**, not universal sports-science recovery requirements.

| Profile level | Minimum planned off-days per seven-day plan block |
| --- | --- |
| Beginner | 2 |
| Amateur (the stored value for intermediate) | 1 |
| Intermediate alias | 1 |
| Advanced | 1 |
| Professional | 0 fixed |
| Missing or unrecognized | 2, conservative fallback |

Zero fixed off-days does not require seven training days. Templates with fewer sessions, athlete-selected unavailable days, daily safety restrictions and coach adjustments can create additional rest. Existing unavailable or empty slots count toward the planning minimum. The schedule does not make up omitted work or redistribute it onto another day.

When a template exceeds the level's training-day limit, the scheduler retains explicit race/test sessions before quality work, then ordinary sessions, then recovery/mobility sessions. Equal-priority slots use a deterministic late-week/midweek tie-break. This is a transparent heuristic, not a claim of optimal recovery timing. Preview review remains essential for sport purpose, the event calendar and the athlete's individual response.

Race/test priority applies only within the athlete's selected available days. It never adds availability or relocates an event from an unavailable date. Athletes and coaches must review those conflicts explicitly before confirming a plan.

The generator persists all seven PlanDay entries. Empty slots have `dayOff: true` and no compulsory workout. Template sessions whose sport is `recovery` are removed from compulsory training; other structured mobility sessions remain eligible and retain their original day slots. Optional recovery movement belongs to the separate daily recovery guidance, not an automatically completed or exported session.

A planned day off is not an athlete-confirmed rest observation. This policy writes no rest metric and no completed activity. JStress and historical training remain unchanged until the athlete records actual performed work or explicitly confirms rest.

Changing a profile level does not rewrite a saved plan. The existing plan-generation preview token binds the profile, setup, current active plans and generated schedule. Only a subsequent confirmed generation archives/replaces future prescriptions through the existing transaction. Historical activity and archived prescriptions remain preserved by that workflow.
