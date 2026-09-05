# Design

## Router: two-stage, not one LLM call

```
Task
  -> Deterministic Eligibility Filter   (scripts/eligibility.mjs)
  -> Native Semantic Skill Matching     (the calling agent's own judgment)
  -> Skill
  -> Verification
```

The deterministic filter checks only machine-checkable facts and never makes
a "does this skill fit" judgment call:

- project scope / platform compatibility (`skill.platforms` vs. task platform)
- required capability availability (`registry/compatibility.json` vs. the
  platform's declared capabilities, enforced in `scripts/render-adapters.mjs`)
- risk tier vs. invocation mode (an L4 skill cannot be auto-invoked)
- skill lifecycle state (QUARANTINED always blocks; DEPRECATED skips by
  default)
- conflicting skills (`registry/conflicts.json`)

Decisions are `USE`, `SKIP`, or `BLOCK`, with a machine-readable `reasons`
array — see `scripts/eligibility.mjs` and its tests.

Semantic matching — whether a task actually calls for, say,
`systematic-debugging` versus `brainstorming` — is left to the calling agent
at runtime. It is not something a deterministic unit test can verify; the
eval fixtures in `evals/routing/cases.json` describe the *expected* outcome
for a human or LLM-judge harness to score later, and are explicitly marked
`NOT YET MEASURED`.

## Risk model

```
L0 = read/analyze              -> automatic
L1 = tests/verification        -> automatic
L2 = local file modification   -> conditional automatic (within an approved task)
L3 = external write/API/GitHub mutation -> explicit intent/permission required
L4 = destructive/high-consequence        -> explicit informed confirmation mandatory, never auto-invoked
```

`scripts/eligibility.mjs` enforces the L4-auto-invoke rule as a hard `BLOCK`,
not a soft warning.

## Canonical skill format

No new skill language. A canonical skill is `SKILL.md` (YAML frontmatter +
Markdown body) plus optional `references/`, `scripts/`, `assets/` —
Agent-Skills-shaped, the same convention Claude Code / Codex / Cursor already
converge on. `registry/skills-index.json` stores only search/routing/version/
compatibility metadata; it never duplicates a skill's body.

### Namespace

Every hub skill uses the `ush-` prefix (`ush-repo-evidence-plan`, not
`global.repo-evidence-plan`) — no dot-based namespacing, and the directory
name must equal the frontmatter `name` field. Both are enforced by
`scripts/validate-hub.mjs` (Test B and Test C).

## Policy vs. skill

Project-specific facts (a frozen validator SHA, an exact gameplay constant, a
benchmark threshold) are Project Policy, not Global Skill, and must never be
promoted. `scripts/validate-hub.mjs` rejects a skill fixture that declares
both `scope: global` and a `project:` binding (Test F) as a structural guard
against exactly this mistake.

## Generated adapters and drift

`scripts/render-adapters.mjs` renders a canonical `SKILL.md` into each
platform's native skill-directory convention
(`ADAPTER_TARGETS` in that file), embedding a `GENERATED — DO NOT EDIT`
marker plus the canonical body's SHA-256 hash. `scripts/check-drift.mjs`
recomputes that hash from the current canonical source and fails if it no
longer matches the marker — whether because someone hand-edited the
generated file, or because the canonical source changed without a
re-render.

If a skill declares a required capability
(`registry/compatibility.json`) a target platform's declared capability list
doesn't include, `render-adapters.mjs` returns `blocked: true` with a reason
instead of writing a broken adapter file (Test G).

## Provenance

Each registry entry records `source_repo`, `source_path`, `source_commit`,
and `content_sha256` for the skill it was generalized from, so any generated
adapter can be traced back to the exact upstream commit and content hash it
came from.

## What v1 does not claim

- No numeric routing precision/recall — `evals/routing/README.md` and
  `evals/compatibility/README.md` are explicit that these are
  **NOT YET MEASURED**, not zero, not high.
- No ChatGPT / claude.ai Projects native adapter — both are
  instruction/knowledge export strategies that are not yet implemented (see
  `adapters/chatgpt/README.md`, `adapters/claude-ai/README.md`).
- Semantic routing (LLM judgment of task-to-skill fit) is out of scope for
  this repository's own test suite by construction — it happens in the
  calling agent, not in this repo.
