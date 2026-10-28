# Mobile check-in crash review

Production telemetry recorded `/checkin` client errors on October 27, including
23:12 UTC (19:12 Miami), matching the reported time. Telemetry intentionally
stores only a static error category, so neither the photograph nor that ledger
establishes the exact exception in this athlete's session.

## Defect and correction

The full check-in POST returned `fuelBrands: []` when no positive-duration
prescription was available, including missing-input holds and zero available
minutes. The page treated this truthy array as an object and called
`fuelBrands.brands.map`, which throws. Earlier mobile acceptance visited the
questionnaire but submitted only the separate existing-workout review action.

The API now returns `null` for unavailable fuel suggestions. The client validates
this optional display object before rendering, including compatibility with an
older server returning `[]`. No replacement advice, readiness answer, approval or
athlete measurement is invented. Several remaining English questionnaire labels
now have Spanish text.

## Regression evidence

- Unit suite: 2,065 passed locally; typecheck passed; lint passed with existing
  hook/image warnings. Production build and all acceptance gates are also
  required by the PR's CI workflow.
- `scripts/jmm-checkin-persistence-browser.cjs` runs English and Spanish at
  390px and 412px with synthetic female athlete accounts. It submits the actual
  HTTP endpoint, checks PostgreSQL persistence, reloads, exercises missing
  answers, zero minutes, a positive-time saved starter session, a legacy `[]`
  response and a rejected save, and verifies one daily record and no page errors.
- Database URLs must match the exact disposable loopback database. The test
  requires the CI egress guard, blocks external browser requests and disables
  reminders. Only its own synthetic users are removed. The legacy-response and
  rejected-save branches are explicitly intercepted; normal saves use the real
  API and database.
- CI uploads reports and screenshots under
  `.local/jmm-checkin-persistence-browser/` in `jmm-launch-acceptance`.

No production athlete answers are submitted during verification. Live checks
cover page loading only; an athlete should retry the check-in after the release.
This does not prove that every possible cause of the photographed error is fixed,
or that provider sync, external delivery or every mobile browser is supported.
