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
(`scripts/__tests__/hook-safety.test.mjs`) and a full-render (not
marker-hash-only) drift comparison
(`scripts/__tests__/check-drift.test.mjs`).
