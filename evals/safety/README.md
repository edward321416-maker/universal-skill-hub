# Safety Evals

Automated, passing tests (run via `npm test`):

- Test H — L4 skill auto-invocation is BLOCKed:
  `scripts/__tests__/eligibility.test.mjs`
- Test G — adapter render BLOCKs on unsupported platform capability:
  `scripts/__tests__/render-adapters.test.mjs`
- Test F — project-bound skill exposed as global scope is rejected:
  `scripts/__tests__/validate-hub.test.mjs`

These are real unit tests with observed RED-then-GREEN runs, not aspirational
descriptions — see the v1 implementation report for the actual command output.

Phase 1.1 additions, all in `scripts/__tests__/eligibility.test.mjs`:

- L3 without explicit intent -> BLOCK (`L3_NO_EXPLICIT_INTENT`)
- L3 without permission -> BLOCK (`L3_NO_PERMISSION`)
- EXPERIMENTAL + L3 auto-invoke -> BLOCK (`EXPERIMENTAL_L3_AUTO`)
- L4 without informed confirmation (even when not auto-invoked) -> BLOCK
  (`L4_NO_INFORMED_CONFIRMATION`)
- a task that would actually use a skill's forbidden capability -> BLOCK
  (`FORBIDDEN_CAPABILITY`) — and confirms merely *declaring* the capability
  without the task using it does NOT block
- two registry-declared conflicting skills selected for one task -> BLOCK
  (`CONFLICTING_SKILL`)
- Project Policy explicitly blocking a skill overrides an otherwise-eligible
  global skill -> BLOCK (`PROJECT_POLICY`)

Plus a regression test for the hook-misconfiguration incident that blocked
this session's own shell access
(`scripts/__tests__/hook-safety.test.mjs`, sanitized to a synthetic path —
see docs/DESIGN.md) and a full-render (not marker-hash-only) drift
comparison (`scripts/__tests__/check-drift.test.mjs`).

Phase 1.1 review-fix round additions:

- Missing required input/tool/capability/permission (fail-closed on an
  unstated availability list) -> BLOCK with `MISSING_INPUT`/`MISSING_TOOL`/
  `MISSING_CAPABILITY`/`MISSING_PERMISSION` (`scripts/__tests__/eligibility.test.mjs`)
- Project-scoped skill for a task in a different project -> SKIP with
  `PROJECT_SCOPE_MISMATCH`; matching project -> USE
- Project Policy is resource/operation-aware, not just skill-id-based: a
  denied operation against a protected resource BLOCKs even when the skill
  itself isn't on any `blockedSkillIds` list (`scripts/__tests__/eligibility.test.mjs`)
- Real cross-project fixtures sourced read-only from
  `edward321416-maker/final-check`, `openbaeseongjin/baeseongjin`,
  `edward321416-maker/DECODE`, and `edward321416-maker/green-remodeling-map`
  (`scripts/__tests__/project-policy-fixtures.test.mjs`) — each cites the
  specific public doc/README line it's grounded in
- Installer ownership detection fixed: a file merely containing the word
  "GENERATED" is no longer treated as ours; ownership requires a matching
  skill-id + platform marker (`scripts/__tests__/install-skills.test.mjs`)
- Hub metadata enum/semver validation: invalid `metadata.status`, `risk`,
  `scope`, non-SemVer `version`, and a malformed optional `compatibility`
  block are all rejected (`scripts/__tests__/validate-hub.test.mjs`)
