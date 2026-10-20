# Build-tool dependency disposition — 20 October 2026

This is a scoped engineering risk assessment for the test candidate, not a claim
that the full dependency audit is clean or an approval to deploy production.

## Patched selector parser

`postcss-selector-parser` is pinned through an npm override to 7.1.7, which includes
the 7.1.6 fix for [GHSA-rj75-hqrm-r3gf](https://github.com/advisories/GHSA-rj75-hqrm-r3gf).
The production build, lint and mobile checks must pass with the override. The
current Tailwind source compilation was compared before/after the override and
produced byte-identical minified CSS. This avoids a Tailwind major-version change.

## Unpatched braces advisory

[GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm) affects
`braces` through 3.0.3. As checked against the official npm registry on this date,
3.0.3 is the latest version and the advisory lists no patched version. Do not
invent a patch version or use `npm audit fix --force` to downgrade Next.js or
replace the styling architecture without compatibility testing.

The affected package is inherited by the development lint/Tailwind glob tooling.
JMM does not import braces, micromatch, fast-glob, chokidar or the selector parser
from application source or runtime scripts. Tailwind's content glob is the
checked-in `./src/**/*.{ts,tsx}` pattern; no athlete, uploaded file, chat or API
input is used to configure a build glob. The production-only audit is a separate
check and must remain free of advisories. A dev dependency can still be present
on a build machine; `dev` classification alone is not proof of non-reachability.

For this candidate, local synthetic testing can proceed because it uses the
reviewed source and fixed configuration. The remaining seven inherited high
advisory entries are **open**, not suppressed or counted as patched. They prevent
an unqualified clean-security statement. Before release, record the release
owner's disposition, recheck the registry/advisory, inspect build/runtime tracing
and re-evaluate if any untrusted glob/selector processing is introduced. Recheck
by 20 November 2026 at the latest, or immediately on a patch or reachability change.

Do not run fork-supplied build configuration with deployment secrets. Do not add
user-controlled compiler/glob configuration. Keep the runtime package audit and
full development-tree audit as distinct evidence in the release report.
