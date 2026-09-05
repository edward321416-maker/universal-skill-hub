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
a "does this skill fit" judgment call. Checks run in a fixed order (each
returns immediately on match) — see the docstring in `scripts/eligibility.mjs`
for the exact sequence and rationale:

1. QUARANTINED lifecycle (host/system safety, always wins)
2. Project Policy explicit block (`projectPolicy.blockedSkillIds`) — Project
   Policy outranks Global Skill
3. Declared skill conflicts (`registry/conflicts.json`, via `task.selectedSkillIds`)
4. Platform compatibility (`skill.platforms` vs. task platform)
5. Forbidden capability *actually used* by the task
   (`task.capabilitiesUsed` intersecting `skill.forbidden_capabilities` —
   note this is deliberately NOT "the host has the capability available";
   the host having a capability and the skill/task using it are different
   things, see Phase 1.1 notes below)
6. L4 risk tier: BLOCK on auto-invoke; BLOCK without
   `task.informedConfirmation` even when not auto-invoked
7. L3 risk tier: BLOCK without `task.explicitIntent`; BLOCK without
   `task.hasPermission`; an EXPERIMENTAL L3 skill BLOCKs on auto-invoke
   regardless of intent/permission
8. DEPRECATED lifecycle — SKIP, not BLOCK

Decisions are `USE`, `SKIP`, or `BLOCK`, each with a machine-readable
`reasonCode` (e.g. `L3_NO_EXPLICIT_INTENT`, `FORBIDDEN_CAPABILITY`,
`CONFLICTING_SKILL`, `PROJECT_POLICY`) plus a human-readable `reasons` array
— see `scripts/eligibility.mjs` and its tests.

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

`scripts/eligibility.mjs` enforces the L4-auto-invoke rule, the L4-requires-
informed-confirmation rule, and the L3-requires-explicit-intent-and-
permission rules (including the EXPERIMENTAL-L3-never-auto rule) as hard
`BLOCK`s, not soft warnings.

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
(`ADAPTER_TARGETS`/`FILESYSTEM_ADAPTER_PLATFORMS` in that file), embedding a
`GENERATED — DO NOT EDIT` marker plus the canonical body's SHA-256 hash.

**Phase 1.1 fix:** `scripts/check-drift.mjs` originally only recomputed the
canonical hash and compared it to the marker's embedded hash. That has a
gap: it proves the marker line wasn't edited, but says nothing about
whether the body *underneath* the marker was hand-edited afterward — a
regression test written first (`scripts/__tests__/check-drift.test.mjs`,
"adapter body hand-edited while the marker/hash is left untouched")
reproduced exactly that gap before the fix. `check-drift.mjs` now fully
re-renders the adapter from its current canonical source
(reusing `renderAdapter` — deterministic, so this is a pure comparison) and
compares the result byte-for-byte against the file on disk. A mismatch
(`reasonCode: CONTENT_MISMATCH`), a missing file (`MISSING`), or a source
that would now BLOCK on that platform (`BLOCKED`) are all reported as
drift.

If a skill declares a required capability
(`registry/compatibility.json`) a target platform's declared capability list
doesn't include, `render-adapters.mjs` returns `blocked: true` with a reason
instead of writing a broken adapter file (Test G).

## Registry <-> canonical consistency

`scripts/registry-consistency.mjs` checks that `registry/skills-index.json`
hasn't drifted from the canonical source it claims to describe. Field
ownership:

- **Canonical-source-owned** (the registry must mirror these exactly):
  `skill_id` <- frontmatter `name`; `version`/`scope`/`risk`/`status` <-
  `metadata.version`/`metadata.scope`/`metadata.risk`/`metadata.status`.
- **Derived** (must equal a fresh computation, owned by neither side):
  `content_sha256` <- SHA-256 of the canonical `SKILL.md`'s exact bytes.
- **Registry-owned** (no canonical-source equivalent): `path`, `platforms`,
  `source_repo`, `source_path`, `source_commit`.

## Distribution: user-level install

`scripts/install-skills.mjs` installs a rendered adapter to a platform's
user-level (`~/.claude/skills/...`, etc.) or project-level skill directory.
It defaults to **dry-run** — nothing is written unless `--apply` is passed —
and classifies any existing target file as `not_installed`,
`managed_current`, `managed_stale`, or `unmanaged` (no `GENERATED` marker).
An `unmanaged` file is never overwritten, `--apply` or not: the installer
must never destroy a file it did not create itself.

`computeInstallPath` throws if a caller tries to combine `scope: 'user'`
with a `projectRoot` — a user-level install path must be a stable
home-relative path (`~/.claude/skills/...`), never a specific project
checkout's absolute path.

## Phase 1.1: hook-safety invariant

While developing this hub, a global Claude Code `PreToolUse` hook pointed at
a specific project checkout's absolute path (shape:
`<drive>:/Users/<name>/Desktop/<project-name>/.claude/hooks/guard.py` — the
real machine-specific path is deliberately not reproduced in this public
repository; `scripts/__tests__/hook-safety.test.mjs` uses a synthetic
`X:/Users/example/Desktop/deleted-project/...` path of the identical shape).
When that checkout was later removed from the session, the hook command
failed on every Bash/PowerShell call, blocking shell access across every
project on the machine until the entry was removed. The original
`guard.py`'s behavior could not be recovered — there was no other copy of it
anywhere reachable — so it was removed rather than reconstructed; **old
guard behavior: NOT RESTORED.**

Invariant added as a result: **user/global Claude configuration MUST NOT
reference a project-specific absolute checkout path for a required hook.**
`scripts/hook-safety.mjs` lints a `settings.json` for exactly this pattern,
and its test suite includes a regression test built from a synthetic
reproduction of the real broken
hook command. This is a hub-level regression guard and documentation
artifact — it does not, and cannot, modify any user's actual local Claude
Code configuration; it only flags the pattern for someone maintaining that
configuration to fix themselves.

## Provenance

Each registry entry records `source_repo`, `source_path`, `source_commit`,
and `content_sha256` for the skill it was generalized from, so any generated
adapter can be traced back to the exact upstream commit and content hash it
came from.

## Platform capability claims — what is verified vs. not, and when

- **Codex skill directory convention**: VERIFIED against official OpenAI
  Codex documentation on 2026-09-05 (`developers.openai.com/codex/skills`,
  redirecting to `learn.chatgpt.com/docs/build-skills`). Codex reads
  skills from, in order: `$CWD/.agents/skills` up to `$REPO_ROOT/.agents/skills`
  (repository level), `$HOME/.agents/skills` (user level),
  `/etc/codex/skills` (admin level), then built-in bundled skills.
  Naming conflicts are not merged — both entries can appear in skill
  selectors.
- **claude.ai custom Skills**: VERIFIED against Anthropic's own
  documentation on 2026-09-05 (support.claude.com, platform.claude.com).
  ZIP upload with the skill folder as the archive's root (not a
  subfolder), Settings > Features, Pro/Max/Team/Enterprise with code
  execution enabled. `scripts/bundle-claude-ai.mjs` implements this shape.
- **ChatGPT native Personal Skills**: VERIFIED to exist as of 2026-09-05
  (OpenAI's Skills documentation, corroborated by third-party coverage) —
  a native, SKILL.md-based upload feature reachable via the Plugin
  Directory, on Business/Enterprise/Healthcare/Edu and paid Work plans.
  Not the same surface as the OpenAI API's "project Skills" resource
  targeted by `scripts/bundle-openai.mjs` — see `adapters/chatgpt/README.md`
  for how these are kept distinct. No automatic Hub -> ChatGPT-account
  sync exists or is planned; that upload step is always manual.
- **OpenAI API project Skills**: VERIFIED against
  `developers.openai.com/api/docs/guides/tools-skills` on 2026-09-05 —
  directory-multipart or single-ZIP upload, immutable versions, 50 MB zip
  / 500 file / 25 MB per-file limits. `scripts/bundle-openai.mjs`
  implements this shape and enforces those limits at build time; no API
  key is used and no upload is performed.
- **No numeric routing precision/recall** — `evals/routing/README.md` and
  `evals/compatibility/README.md` are explicit that these are
  **NOT YET MEASURED**, not zero, not high.
- **Semantic routing** (LLM judgment of task-to-skill fit) is out of scope
  for this repository's own test suite by construction — it happens in the
  calling agent, not in this repo.
- **Real installs performed** (2026-09-05, this machine, explicitly
  authorized): `scripts/install-skills.mjs --apply` for both Claude Code
  (`~/.claude/skills/ush-repo-evidence-plan/SKILL.md`) and Codex
  (`~/.agents/skills/ush-repo-evidence-plan/SKILL.md`), each verified
  byte-identical to a fresh `renderAdapter` render. Claude Code discovery
  was independently confirmed within this same session: after install, the
  harness's own skill listing surfaced `ush-repo-evidence-plan`, and
  invoking it via the Skill tool loaded exactly the installed file's
  content. Codex live discovery is **NOT TESTED** — no safe read-only
  diagnostic in `codex doctor` surfaces skill discovery, and actually
  checking would require a live `codex` session that contacts OpenAI's
  ChatGPT backend, which was not separately authorized here. Cursor and
  OpenCode installs remain **NOT TESTED** (no local install of either on
  this machine).
- **Implicit invocation** (the calling agent autonomously selecting this
  skill for a task, without being told its name) is **NOT TESTED** for any
  platform — that would require a fresh session given a task and observed
  making its own choice, which this same verification pass cannot cleanly
  produce without contaminating the test.
