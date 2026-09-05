# Universal Skill Hub v1 — Implementation Plan

Date: 2026-09-05
Branch: `phase-1-bootstrap`

## Goal

Stand up a public, GitHub-hosted registry of canonical, cross-platform Agent
Skills (`skills/` + `registry/` + `adapters/`), migrate one real skill from
`openbaeseongjin/baeseongjin` as proof, and back every mechanism (naming,
lifecycle, platform compatibility, drift, risk-tiered auto-invocation) with a
real RED-then-GREEN unit test — no validator, adapter, or eval shipped
without a test that was watched fail first.

## Phases and status

- **1-A Bootstrap** — repo identity verified via `gh`/GitHub MCP, isolated
  local branch `phase-1-bootstrap` off `origin/main` (95cc0ff), directory
  skeleton created. Done.
- **1-B Validator TDD** — `scripts/validate-hub.mjs` + 6 tests (A-F). RED
  observed (module not found), then GREEN. Done.
- **1-C First skill** — `ush-repo-evidence-plan` generalized from
  `.codex/skills/repo-task-plan/SKILL.md`, with provenance
  (`source_repo`/`source_commit`/`content_sha256`) recorded in
  `registry/skills-index.json`. Done.
- **1-D Registry** — `skills-index.json`, `compatibility.json`,
  `conflicts.json`, `lifecycle.json`. Done (minimal, single-skill).
- **1-E Adapters** — `scripts/render-adapters.mjs` (Test G RED->GREEN),
  generated `adapters/{codex,claude-code,cursor,opencode}/ush-repo-evidence-plan/SKILL.md`.
  ChatGPT/claude.ai left as documented, unimplemented export-strategy items.
  Done for the four filesystem-adapter platforms; ChatGPT/claude.ai
  intentionally deferred.
- **1-F Routing/safety evals** — deterministic eligibility filter
  (`scripts/eligibility.mjs`, Test H RED->GREEN) covering L4-auto-invoke
  block, QUARANTINED/DEPRECATED lifecycle, platform-mismatch block. Semantic
  routing fixtures for the 7 cases in the brief recorded as data
  (`evals/routing/cases.json`), explicitly marked NOT YET MEASURED since
  semantic task-to-skill fit needs an LLM judge, not a unit test. Done within
  that limit.
- **1-G ONE ROPE equivalence** — invariant-by-invariant comparison in
  `docs/MIGRATION_MAP.md`; no destructive change made to
  `openbaeseongjin/baeseongjin`. Done.
- **1-H Drift** — `scripts/check-drift.mjs` (Test I RED->GREEN), 0 drift
  across the 4 generated adapters at time of writing. Done.
- **1-I Verification** — see the implementation report delivered alongside
  this plan for actual `npm test` / `npm run validate` / `npm run
  check-drift` output, git diff review, and a manual secrets scan.
- **1-J PR** — opened from `phase-1-bootstrap` against `main`, not merged
  automatically.

## Explicit non-goals for v1

- No numeric routing precision/recall/false-invocation-rate — reported as
  NOT YET MEASURED per the success-metrics discipline in the original brief.
- No ChatGPT native skill sync assumption, no claude.ai-shares-Claude-Code-state
  assumption.
- No destructive change to any of `final-check`, `DECODE`,
  `green-remodeling-map`, or `openbaeseongjin/baeseongjin`.
