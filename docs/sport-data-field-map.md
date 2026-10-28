# Separate sport evidence: implementation map

The mobile prototype is in prototypes/sport-data-mobile.html. Its values are
synthetic and its buttons never save or send data.

| Input/source | Stored meaning | Athlete display | Training use |
| --- | --- | --- | --- |
| Activity sport | Run, bike or swim, independently | Separate sport tabs and history | Existing performed-training pipeline |
| Distance and exact reported duration | km and exact calculation duration | km/mi; swim also m/yd; clock duration | Calculated average speed, with duration basis |
| Provider/manual speed | Explicit unit and provenance | km/h or mph | Observation, never automatically FTP/threshold |
| HR and power already normalized | bpm and W, missing stays null | bpm/W with observation date/source | Existing validated reference rules |
| Garmin received activity summaries | Authenticated, athlete-bound, processed source | Garmin reported; latest observed date, received date where available | Local deterministic processing only |
| Existing whole-minute records | Rounded historical duration | Approximate speed labelled as such | No manufactured exactness |
| Cadence, laps, strokes, pool detail | Only validated supplied contracts | Explicit missing state until verified | No guessed normalization from similarly named APIs |
| Manual report | Chosen sport, date, two measurements, optional actuals | Review calculation, confirm, saved receipt | Actual performed history, without changing thresholds |
| Missing distance on an existing activity | Separate audited athlete annotation, provider fields retained | Ask only for distance; reuse known timing, with precision label | No extra workout or invented test result |

Latest means observed activity date, not upload date. Each sport uses its own
recent records. Potential duplicates and restricted origins block derived
aggregates instead of understating load. Planned sessions are not measurements.
Partial records remain visible without manufacturing missing values.

The first complete workflow is own-account sport history → local calculated
speed → manual fallback → review/confirm → saved/reloaded actual activity.
The latest legacy Garmin summary per sport can be read from its already-processed
encrypted archive only while the existing connection is still activity-authorized.
It is bound to the stored athlete, provider identity, summary, sport, start,
distance and rounded duration. Pending corrections are not used. This read performs
no provider request or database write.
Missing-distance completion rechecks source, possible copies, revision and exact
timing under the save lock. It retains the provider source and adds an explicitly
manual annotation, so Garmin-derived results keep their external-AI restrictions.
Current profile, chat, plan-review and benchmark forms remain available.
No external AI or Telegram receives this new view or Garmin-derived summaries.
New manual sport entries use a separate local-only provenance, because entering
a measurement by hand does not establish permission to send it to external AI.
The private training engine can use their audited actual history; the external-AI
allowlist does not admit this source. No extra consent checkbox is used to infer
where a hand-entered number originally came from.
No credentials or permission expansion is part of this change.

Verification covers exact clock/distance/speed conversions, invalid or conflicting
numbers, source/date selection, partial records, duplicate and concurrent saves,
cross-athlete denial, privacy boundaries and EN/ES mobile save/reload.

## Scope and remaining limits

The supported Garmin summary mapping is exact duration, distance, existing HR,
power and energy fields, and explicitly named indoor/pool/open-water sport
subtypes. It does not turn an ordinary workout into FTP, CSS, VO2 max or a
threshold test. Manual cadence uses rpm for bike, steps/min for run and
strokes/min for swim; those units are not guessed for unmapped device samples.
Garmin cadence, strokes, lap details, pool length and callback-file decoding still
need a verified payload contract. Their raw archive is not a claim that these
fields have been normalized. Existing supported detailed-upload analysis remains
available through Connections. No unverified callback URL is fetched.

The view reads the latest 90 days, at most 500 candidate records; source receipts
and activity dates remain distinct. A truncated window is not shown as a complete
training total. Legacy whole-minute timing is explicitly approximate. New manual
observations retain exact calculation timing in versioned details; the existing
integer-minute training budget rounds upward, without claiming a new physiological
measurement or replacing the training-load method.

The browser acceptance runs only in the disposable loopback CI database with
provider egress blocked. It checks actual Garmin persistence/archive recovery,
manual source privacy, three sport/unit save/reload paths, and an existing-record
distance completion including a failed save and retry. This is not a live Garmin
delivery, complete-backfill or compliance certification.
