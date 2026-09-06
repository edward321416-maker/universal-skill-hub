# Phase 1.2: Canonical Skill Migration — Implementation Plan

Date: 2026-09-06
Branch: `issue/3-phase-1-2-skill-migration`
Issue: [#3](https://github.com/edward321416-maker/universal-skill-hub/issues/3)
Precondition: verified `42676fd` (Phase 1.1 merge) is an ancestor of
`origin/main`, synced local `main` to `origin/main`, ran `npm ci && npm run
verify` against a clean baseline before any Phase 1.2 change — all green.

## Goal

Migrate five skills that already exist and were actually used in
`openbaeseongjin/baeseongjin` (ONE ROPE) into canonical, generalized Agent
Skills in this hub, following the pattern `ush-repo-evidence-plan`
established in Phase 1. ONE ROPE is a read-only migration source — nothing
in it was modified, deleted, or replaced.

## Migrated skills (in required order)

1. `ush-github-task-flow` (`skills/git/`, risk L3)
2. `ush-concurrent-edit-coordination` (`skills/git/`, risk L0)
3. `ush-game-meeting-plan` (`skills/game/`, scope domain, risk L0)
4. `ush-discord-repo-cross-reference` (`skills/discord/`, scope domain, risk L0 + `send` operation gate)
5. `ush-work-announcement` (`skills/discord/`, scope domain, risk L0 + `publish` operation gate)

Each was migrated with RED-then-GREEN tests before moving to the next:
validator pass, registry entry + content hash, eligibility fixtures
(including negative/regression cases), adapter render, drift check, before
starting the next skill. See `docs/MIGRATION_MAP.md` for the full
invariant-by-invariant equivalence tables and the `.codex`/`.cursor`/
`.opencode` drift comparison (all three copies are semantically equivalent
per skill — cursor/opencode are byte-identical to each other; only YAML
`description` line-wrapping style differs from `.codex`, bodies are
byte-identical).

## Engine additions made to support these migrations

- **`shell_exec` added to `DEFAULT_PLATFORM_CAPABILITIES`** for codex/
  claude-code/cursor/opencode in `scripts/render-adapters.mjs` — these are
  genuinely shell-capable CLI/IDE agents, and `ush-github-task-flow` needs
  to declare that requirement to render at all.
- **`operationGates` in `scripts/eligibility.mjs`** — lets an L0 skill gate
  one specific operation (`send`, `publish`) independently of its overall
  risk tier, with its own `requiresExplicitIntent`/`requiresPermission`/
  `requiredCapabilities` checks. Used by `ush-discord-repo-cross-reference`
  and `ush-work-announcement`.
- **`scripts/approval-gate.mjs`** — content-hash-based approval
  invalidation for `ush-work-announcement`'s "material edit resets
  approval" invariant.
- **`partitionBundleEligibility()` in `scripts/bundle-skill.mjs`** — both
  bundle CLIs (`bundle-claude-ai.mjs`, `bundle-openai.mjs`) now explicitly
  report a skill as `SKIP (not eligible for <platform>)` when it doesn't
  list that platform, rather than silently bundling everything
  unconditionally (the previous behavior, which predates this Phase).

## Why the five new skills are not claude.ai/OpenAI-API bundle-eligible

All five require either shell execution against the live repository
(`ush-github-task-flow`, `ush-concurrent-edit-coordination`) or a live chat
connector (`ush-discord-repo-cross-reference`, `ush-work-announcement`), or
are meant to run against a live git history (`ush-game-meeting-plan`
touches repository symbols/tests). claude.ai/OpenAI API Skill sandboxes are
documented as having no or limited network access and no live connector
access — bundling these would produce an artifact that can't actually do
its job in that environment, which is worse than not producing one. Only
`ush-repo-evidence-plan` (read-only, no live connector) remains
bundle-eligible for those two surfaces. `registry/skills-index.json`'s
`platforms` list is the single source of truth for this — a skill is never
marked compatible with a platform "because the file can be copied there."

## Real installs performed

`scripts/install-skills.mjs --apply` for Claude Code (`~/.claude/skills/`)
and Codex (`~/.agents/skills/`), dry-run first, applied only because the
targets were `not_installed` (not overwriting anything unmanaged) — see the
final report for exact paths and verification. Cursor/OpenCode real
installs remain NOT TESTED (neither client is present on this machine).

## Lifecycle

All five new skills, and `ush-repo-evidence-plan`, remain `EXPERIMENTAL`.
Phase 1.2's goal is canonicalization, testing, adapter compatibility, and
migration equivalence — not lifecycle promotion, which needs actual
cross-project usage evidence this phase does not produce.

## Not done in this phase

- No numeric routing precision/recall — the Phase 1.2 routing cases in
  `evals/routing/cases.json` are data describing expected behavior, marked
  NOT YET MEASURED, same discipline as Phase 1's cases.
- No Cursor/OpenCode real installs (clients not present).
- No promotion of any project-specific ONE ROPE detail (exact MCP package/
  version, channel-name convention, commit-trailer format, branch-slug
  enforcement) into a canonical skill — see docs/MIGRATION_MAP.md's
  "Deliberately dropped" list per skill.
- No merge. This branch and its PR are for independent review.
