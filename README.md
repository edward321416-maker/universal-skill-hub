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
             conflicts, lifecycle, runtime-requirements (the central
             capability/permission/tool vocabulary). Never a copy of
             skill bodies.
adapters/    generated, per-platform renders of canonical skills.
             Marked GENERATED — DO NOT EDIT. Regenerate with
             `npm run render-adapters`.
evals/       routing / compatibility / safety / regression fixtures
scripts/     validate-hub.mjs, render-adapters.mjs, check-drift.mjs,
             eligibility.mjs, registry-consistency.mjs, install-skills.mjs,
             hook-safety.mjs, load-compatibility.mjs
docs/        design notes, migration mapping, superpowers plans
.github/workflows/ci.yml   verify/validate/render/drift on every PR and push to main
```

See [docs/DESIGN.md](docs/DESIGN.md) for the full rationale and
[docs/MIGRATION_MAP.md](docs/MIGRATION_MAP.md) for how each migrated skill
maps back to its source.

## Canonical skills

| Skill | Scope | Risk | Origin |
|---|---|---|---|
| `ush-repo-evidence-plan` | global | L0 | `openbaeseongjin/baeseongjin` |
| `ush-github-task-flow` | global | L3 | `openbaeseongjin/baeseongjin` |
| `ush-concurrent-edit-coordination` | global | L0 | `openbaeseongjin/baeseongjin` |
| `ush-game-meeting-plan` | domain (game) | L0 | `openbaeseongjin/baeseongjin` |
| `ush-discord-repo-cross-reference` | domain (discord) | L0 (send op gated) | `openbaeseongjin/baeseongjin` |
| `ush-work-announcement` | domain (discord) | L0 (publish op gated) | `openbaeseongjin/baeseongjin` |

All six remain `EXPERIMENTAL` — see [docs/MIGRATION_MAP.md](docs/MIGRATION_MAP.md)
for the equivalence check behind each one.

## Skill lifecycle

Every canonical skill carries a `metadata.status` of `EXPERIMENTAL`,
`VALIDATED`, `DEPRECATED`, or `QUARANTINED` (`registry/lifecycle.json`).
`QUARANTINED` always blocks invocation; `DEPRECATED` is skipped by default;
`EXPERIMENTAL` is routable but not eligible for automatic L3+ actions.

## Platform support

| Platform | Strategy |
|---|---|
| Codex | native skill directory — project: `.agents/skills/` (scanned from cwd up to repo root); user: `$HOME/.agents/skills/`; admin: `/etc/codex/skills/` (VERIFIED against official OpenAI Codex docs, 2026-09-05). Generated adapter; real filesystem install smoke-tested (`scripts/install-skills.mjs`), byte-identical to expected render. Live discovery NOT TESTED (no safe read-only diagnostic; an actual check would require a live `codex` session contacting OpenAI's backend) |
| Claude Code | native skill directory `.claude/skills/` (project) / `~/.claude/skills/` (user). Generated adapter; real install + **live discovery confirmed** — this session's own harness listed and loaded the installed skill after `--apply` |
| Cursor | native skill directory (`.cursor/skills/` and `.agents/skills/`, project + user level — VERIFIED against `cursor.com/docs/skills`, 2026-09-06), generated adapter |
| OpenCode | native skill directory (`.opencode/skills/` project, `~/.config/opencode/skills/` global — VERIFIED against `opencode.ai/docs/skills/`, 2026-09-06), generated adapter |
| ChatGPT / Work | See `adapters/chatgpt/README.md` for the full A/B/C breakdown (Standalone Skills / plugin-bundled Skills / OpenAI API project Skills). The desktop app's Standalone Skills feature is real per docs, but the Hub implements no adapter or bundle target for it — `runtime_exclusions: UNVERIFIED` for every skill, not silently omitted and not claimed supported. No automatic account sync exists or is planned |
| OpenAI API (project Skills) | Deterministic ZIP bundle generator (`npm run bundle:openai`), documented size/file-count limits enforced at build time; no API key used, no upload performed. Listed in `runtime_support` for all six skills (VERIFIED against `developers.openai.com/api/docs/guides/tools-skills`, 2026-09-05) |
| claude.ai Projects | Deterministic ZIP bundle generator (`npm run bundle:claude-ai`), verified shape (skill folder at ZIP root); no upload performed. claude.ai Projects still does not share local Claude Code repository state. Listed in `runtime_support` for all six skills |

Every platform above is one of a skill's `runtime_support` entries in
`registry/skills-index.json` — see
[docs/DESIGN.md](docs/DESIGN.md)'s "Runtime compatibility model" section
for the authoritative `runtime_support`/`platforms`/`runtime_exclusions`
definitions and the evidence-provenance requirements behind each status.

Claude Code is treated as first-class, not an afterthought: every canonical
skill is expected to work with no Claude-specific capability required, with
Claude-only features (fork context, model/effort hints, hooks, path scoping)
kept in adapter-side overrides rather than the canonical body.

## Quick start

```bash
npm test                    # run all unit tests (validator, adapters, drift, eligibility, installer, ...)
npm run validate            # validate every skill under skills/
npm run registry-consistency  # check registry/skills-index.json against each skill's canonical source
npm run render-adapters      # regenerate adapters/<platform>/<skill>/SKILL.md from canonical sources
npm run check-drift          # full-render comparison: detect hand-edited or stale generated adapter files
npm run install-skills -- --platform claude-code --scope user   # dry-run by default; add --apply to write
npm run bundle:claude-ai      # deterministic ZIP for claude.ai custom Skills (no upload)
npm run bundle:openai         # deterministic ZIP for the OpenAI API "project Skills" resource (no upload)
npm run verify                # the full release gate: test + validate + registry-consistency +
                               # render-adapters + `git diff --exit-code -- adapters` + check-drift +
                               # both bundle generators + an installer dry-run smoke test
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

## Eligibility gates (risk tiers L0-L4)

`scripts/eligibility.mjs` enforces, in order: QUARANTINED always BLOCKs;
Project Policy can explicitly BLOCK a skill (Project Policy outranks Global
Skill); declared skill conflicts (`registry/conflicts.json`) BLOCK; platform
compatibility BLOCKs; a task that would actually use one of a skill's
`forbidden_capabilities` BLOCKs; L4 BLOCKs on auto-invoke and requires
explicit informed confirmation otherwise; L3 requires explicit user intent
and permission, and an EXPERIMENTAL L3 skill BLOCKs on auto-invoke
regardless; DEPRECATED SKIPs by default. Every decision carries a
machine-readable `reasonCode`.

## Configuration safety invariant

**User/global Claude configuration MUST NOT reference a project-specific
absolute checkout path for a required hook.** A hook pointing at
`D:/Users/.../some-project/.claude/hooks/guard.py` breaks every tool call on
every project the moment that one project's checkout is deleted or moved —
this happened during this hub's own development (see
`docs/DESIGN.md`'s Phase 1.1 notes) and blocked Bash/PowerShell entirely
until repaired. Safe patterns: a stable home-relative dotfile path
(`~/.claude/...`, or a `%USERPROFILE%`/`$env:USERPROFILE` expansion into one)
or a path the harness resolves relative to the current project itself.
`scripts/hook-safety.mjs` lints a `settings.json` for exactly this class of
mistake (`node scripts/hook-safety.mjs <path-to-settings.json>`) and
`scripts/__tests__/hook-safety.test.mjs` carries a regression test built
from the actual incident.

## Generated adapter warning

Every file under `adapters/` is machine-generated and carries a
`GENERATED — DO NOT EDIT` marker with the canonical content hash it was
rendered from. Edit the canonical `skills/**/SKILL.md` instead and re-run
`npm run render-adapters`; `npm run check-drift` fails if a generated file's
embedded hash no longer matches its canonical source.
