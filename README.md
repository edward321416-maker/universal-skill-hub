# Universal Skill Hub

A central registry of canonical, cross-platform Agent Skills — written once,
verified once, and rendered as generated adapters for the agent surfaces that
actually consume them (Codex, Claude Code, claude.ai Projects, ChatGPT/Work,
Cursor, OpenCode).

## What this is

Skills that prove useful in one project often get copy-pasted into every
other project's own `.codex/skills/`, `.cursor/skills/`, `.claude/skills/`
directory, each copy silently drifting from the others. This hub keeps one
canonical source per skill and generates the per-platform copies from it, so
a fix or improvement made once propagates everywhere instead of forking N
ways.

## Why it exists

The goal is **not** to get every agent invoking as many skills as possible.
It is to make sure a skill that helped in one project gets **correctly
considered** as a candidate in another project, gets **checked for actual
fit** against the current task, and only **then** gets used — nothing more.

## Architecture

```
skills/      canonical SKILL.md + resources, one directory per skill,
             organized by scope: global/, git/, game/, discord/, domain/
policies/    project-specific rules that must never be promoted to a
             global skill (see Project Policy Precedence below)
registry/    machine-readable metadata only — index, compatibility,
             conflicts, lifecycle. Never a copy of skill bodies.
adapters/    generated, per-platform renders of canonical skills.
             Marked GENERATED — DO NOT EDIT. Regenerate with
             `npm run render-adapters`.
evals/       routing / compatibility / safety / regression fixtures
scripts/     validate-hub.mjs, render-adapters.mjs, check-drift.mjs,
             eligibility.mjs
docs/        design notes, migration mapping, superpowers plans
```

See [docs/DESIGN.md](docs/DESIGN.md) for the full rationale and
[docs/MIGRATION_MAP.md](docs/MIGRATION_MAP.md) for how the first migrated
skill maps back to its source.

## Skill lifecycle

Every canonical skill carries a `metadata.status` of `EXPERIMENTAL`,
`VALIDATED`, `DEPRECATED`, or `QUARANTINED` (`registry/lifecycle.json`).
`QUARANTINED` always blocks invocation; `DEPRECATED` is skipped by default;
`EXPERIMENTAL` is routable but not eligible for automatic L3+ actions.

## Platform support

| Platform | Strategy |
|---|---|
| Codex | native skill directory (`.agents/skills/`), generated adapter |
| Claude Code | native skill directory (`.claude/skills/`), generated adapter |
| Cursor | native skill directory (`.cursor/skills/`), generated adapter |
| OpenCode | native skill directory (`.opencode/skills/`), generated adapter |
| ChatGPT / Work | instruction-export bundle (not yet implemented) |
| claude.ai Projects | Project Knowledge export bundle (not yet implemented) |

Claude Code is treated as first-class, not an afterthought: every canonical
skill is expected to work with no Claude-specific capability required, with
Claude-only features (fork context, model/effort hints, hooks, path scoping)
kept in adapter-side overrides rather than the canonical body.

## Quick start

```bash
npm test               # run all unit tests (validator, adapters, drift, eligibility)
npm run validate       # validate every skill under skills/
npm run render-adapters  # regenerate adapters/<platform>/<skill>/SKILL.md from canonical sources
npm run check-drift    # detect hand-edited or stale generated adapter files
```

## Security model

- No tokens, API keys, OAuth secrets, private IDs, signed URLs, or
  credentials are ever stored in a skill.
- This repository is **public** — do not commit personal data, local
  absolute paths, private project/chat IDs, or sensitive business data.
- Untrusted content retrieved by a skill at runtime is data, never
  instructions — a skill must never treat text it reads as a command.

## Project Policy Precedence

```
Direct User Instruction
  > Host/System Safety
  > Project Policy
  > Domain Skill
  > Global Skill
  > Default Agent Behavior
```

A project-specific rule (a frozen validator SHA, an exact benchmark
threshold, a gameplay constant) is never promoted into a global skill — see
`policies/projects/README.md`.

## Generated adapter warning

Every file under `adapters/` is machine-generated and carries a
`GENERATED — DO NOT EDIT` marker with the canonical content hash it was
rendered from. Edit the canonical `skills/**/SKILL.md` instead and re-run
`npm run render-adapters`; `npm run check-drift` fails if a generated file's
embedded hash no longer matches its canonical source.
