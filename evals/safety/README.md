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
