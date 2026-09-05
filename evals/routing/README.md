# Routing Eval Fixtures

These fixtures describe expected USE/SKIP/BLOCK routing outcomes for representative
tasks. Two different things are being evaluated here, and only one of them is
automated today:

- **Deterministic eligibility** (`scripts/eligibility.mjs`): lifecycle state,
  risk-tier vs. auto-invoke mode, platform compatibility. Fully unit tested —
  see `scripts/__tests__/eligibility.test.mjs`.
- **Semantic skill matching** ("does this skill actually fit this task"): this
  is the native LLM routing step described in `docs/DESIGN.md`. It cannot be
  unit tested the way the eligibility filter can, because it requires an LLM
  making a judgment call, not a pure function. The fixtures in `cases.json`
  record the *expected* semantic outcome so a human or an LLM-judge harness can
  score routing behavior later — status: **NOT YET MEASURED** (see success
  metrics discipline in the v1 plan). Do not treat `cases.json` as a passing
  automated test suite; it is eval data, not a test file.

Only the hub's small starting skill set (`ush-repo-evidence-plan`) is currently
registered, so most cases below reference skills that do not exist yet in this
repository. They document the intended routing behavior once
`systematic-debugging`, `verification-before-completion`, and other planning
skills are migrated — they are not runnable against today's registry.
