# Calendar overlap correction

The calendar previously queried every workout in its date range, including pending prescriptions from archived or superseded cycles. Those rows were retained intentionally for history, but were incorrectly presented as additional current training. This reader was shared across athlete accounts.

Calendar reads now use the newest active cycle, exclude superseded/unperformed prescriptions, and preserve reports even when their original plan is archived. Genuine optional pairs retain both distinct workout IDs. Raw records are not deleted or updated by calendar reads.

Device observations follow the existing reconciliation rules. Known linked/corroborated records and unresolved possible-copy components are compact visual bundles. A possible-copy bundle is not a confirmed identity or one completed workout: no combined duration, calories or load is displayed. Opening the day preserves the individual source records and their result editors. Explicit reviewed differences remain separate. Reconciliation choices are not created by the calendar.

Both calendar requests run concurrently and request uncached account data. Responses are private/no-store. The calendar endpoint remains authenticated and owner-scoped; embedded active-plan sessions use the same visible workout IDs. No scheduler, baseline, physiological target, source record or delivery state is changed.

Reported activity details show actual source measurements and unknowns, not generated warm-up or main-set steps inferred from total duration. The day-detail count labels session/source records, and reported records use the result editor rather than plan-move or completion shortcuts.

Verification covers archived-plan visibility, preserved actual/unknown reports, true doubles, copy bundles, explicit differences, owner isolation, no data mutation, timezone/DST race dates, repeated plan activation over HTTP/Postgres, and mobile/desktop calendar journeys with intercepted APIs. Physical devices and external calendar imports are outside this display fix.
