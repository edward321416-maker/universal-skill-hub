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
returns immediately on match). **The docstring at the top of
`scripts/eligibility.mjs` is the single source of truth for this order** —
the list below is a restatement of it, kept in sync by
`scripts/__tests__/design-doc-alignment.test.mjs`, which fails if a
`reasonCode` the engine can emit isn't mentioned here (so this list cannot
silently go stale the way it did once already in Phase 1.2 — it used to
omit project scope, required-field, and per-operation-gate checks entirely):

1. **QUARANTINED** lifecycle (host/system safety, always wins)
2. **Project Policy**: explicit block (`projectPolicy.blockedSkillIds`), or a
   denied operation against a protected resource
   (`projectPolicy.deniedOperations`/`protectedResources`) — Project Policy
   outranks Global Skill (`reasonCode: PROJECT_POLICY`)
3. Declared skill **conflicts** (`registry/conflicts.json`, via
   `task.selectedSkillIds`) (`CONFLICTING_SKILL`)
4. **Platform compatibility** (`skill.platforms` vs. task platform)
   (`PLATFORM_UNSUPPORTED`)
5. **Project scope mismatch** — SKIP, not BLOCK, when `skill.project_scope`
   doesn't match `task.project` (`PROJECT_SCOPE_MISMATCH`)
6. **Missing required input/tool/capability/permission** — fail-closed: an
   unstated availability list means "nothing available", not "assume it's
   fine" (`MISSING_INPUT`/`MISSING_TOOL`/`MISSING_CAPABILITY`/`MISSING_PERMISSION`)
7. **Per-operation gates** (`skill.operationGates`) for any operation
   actually present in `task.requestedOperations`, independent of the
   skill's overall risk tier: explicit intent
   (`OPERATION_NO_EXPLICIT_INTENT`), then named `requiredPermissions`
   checked against `task.grantedPermissions` — fail-closed, and NOT
   satisfiable by a generic `task.hasPermission: true` once
   `requiredPermissions` is declared (`OPERATION_MISSING_PERMISSION`; the
   legacy generic `requiresPermission`/`hasPermission` boolean,
   `OPERATION_NO_PERMISSION`, is only used when a gate declares no named
   permissions), then `requiredCapabilities`
   (`OPERATION_MISSING_CAPABILITY`), then — if the gate declares
   `requiresApprovedContentMatch` — that the exact approved text still
   matches what's about to be sent (`OPERATION_NO_APPROVED_CONTENT` if
   nothing was approved, `OPERATION_APPROVAL_STALE` if the content changed
   since approval)
8. **Forbidden capability** *actually used* by the task
   (`task.capabilitiesUsed` intersecting `skill.forbidden_capabilities` —
   note this is deliberately NOT "the host has the capability available";
   the host having a capability and the skill/task using it are different
   things) (`FORBIDDEN_CAPABILITY`)
9. **L4** risk tier: BLOCK on auto-invoke (`L4_AUTO`); BLOCK without
   `task.informedConfirmation` even when not auto-invoked
   (`L4_NO_INFORMED_CONFIRMATION`)
10. **L3** risk tier: an EXPERIMENTAL L3 skill BLOCKs on auto-invoke
    regardless of intent/permission (`EXPERIMENTAL_L3_AUTO`); BLOCK without
    `task.explicitIntent` (`L3_NO_EXPLICIT_INTENT`); BLOCK without
    `task.hasPermission` (`L3_NO_PERMISSION`)
11. **DEPRECATED** lifecycle — SKIP, not BLOCK (`DEPRECATED`)

Anything that reaches the end without matching any of the above is `USE`
(`reasonCode: ELIGIBLE`). Decisions are always `USE`, `SKIP`, or `BLOCK`,
each with a machine-readable `reasonCode` plus a human-readable `reasons`
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

`scripts/eligibility.mjs` enforces the L4-auto-invoke rule, the L4-requires-
informed-confirmation rule, and the L3-requires-explicit-intent-and-
permission rules (including the EXPERIMENTAL-L3-never-auto rule) as hard
`BLOCK`s, not soft warnings.

### Per-operation gates (Phase 1.2, schema finalized in review round 2)

Some skills are read-only/drafting by default (risk L0) but have exactly
one operation that should be gated independently of that overall risk tier
— e.g. `ush-discord-repo-cross-reference`'s `send` operation,
`ush-work-announcement`'s `publish` operation, or
`ush-github-task-flow`'s `merge` operation. Forcing the whole skill to L3
would make its *default* behavior (analysis, drafting, PR delivery)
require checks it doesn't need for that default path. Instead, a skill
entry can declare, per operation:

```
operationGates: {
  <operation>: {
    requiredCapabilities: [...],          // fail-closed vs. task.availableCapabilities
    requiredPermissions: [...],           // fail-closed vs. task.grantedPermissions
    requiresExplicitIntent: true|false,   // checks task.explicitIntent
    requiresApprovedContentMatch: true|false, // see below
  }
}
```

`evaluateEligibility` checks a gate only for operations actually present in
`task.requestedOperations`, independent of `skill.risk`. Within one gate,
the checks run: explicit intent, then named permissions, then
capabilities, then content-approval match (see
`scripts/eligibility.mjs`'s docstring for the exact order and the full
eligibility check sequence).

**`requiredPermissions`** is checked against `task.grantedPermissions`,
fail-closed (an unstated `grantedPermissions` list means "nothing
granted", not "assume it's fine"). Once a gate declares
`requiredPermissions`, a generic `task.hasPermission: true` is **not**
sufficient on its own to satisfy that gate — an unrelated permission grant
must never authorize a specific gated operation like `send` or `merge`.
The generic `requiresPermission`/`task.hasPermission` boolean check only
runs as a legacy fallback when a gate declares no named permissions at
all.

**`requiresApprovedContentMatch`** (used by `ush-work-announcement`'s
`publish` gate) is checked **inside `evaluateEligibility` itself** — it is
not caller-tracked state left outside the engine. The gate compares
`task.approvedContentHash` against `task.currentContentHash` via
`scripts/approval-gate.mjs`'s `isApprovalValid()`: no approved hash at all
BLOCKs with `OPERATION_NO_APPROVED_CONTENT`; a hash that no longer matches
the current content (a material edit after approval) BLOCKs with
`OPERATION_APPROVAL_STALE`; an exact match lets the gate proceed to
whatever check comes next. The caller's only remaining job is to compute
and pass both hashes correctly — the invalidation logic itself is
deterministic and engine-enforced, not a documented convention the caller
has to remember to apply.

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
  `bundle_targets`, `source_repo`, `source_path`, `source_commit`.

## `platforms` vs. `bundle_targets` (two different dimensions)

These are easy to conflate — a real Phase 1.2 bug did exactly that
(`bundle-openai.mjs` used to key off the `"chatgpt"` `platforms` entry to
decide OpenAI API bundle eligibility, a completely unrelated surface). The
definitions, settled in Phase 1.2 review round 3:

- **`platforms`** = the native runtime host surfaces on which the
  deterministic eligibility router (`scripts/eligibility.mjs`) may
  evaluate and execute the skill as a live task — i.e., values that can
  legitimately appear as `task.platform`. This includes the four
  filesystem-adapter CLI/IDE agents (`codex`, `claude-code`, `cursor`,
  `opencode`) **and** any other surface a skill is actually routable on as
  a live task — `ush-repo-evidence-plan` legitimately lists `claude-ai` and
  `chatgpt` here because it is a pure read-only reasoning skill with no
  host-specific requirement, expected to be invoked as a live task on
  those surfaces too, not merely packaged for them.
- **`bundle_targets`** = artifact/package distribution surfaces: can this
  skill be packaged as a portable bundle for that surface *at all*
  (`claude-ai`, `openai-api` — see `scripts/bundle-targets.mjs` for the
  authoritative key list). A skill being bundle-eligible for a surface
  does **not** imply it is (yet) a `platforms` entry — packaging and live
  task-routing are different integration milestones. Conversely, a skill
  can be `platforms`-eligible without ever being bundled anywhere (e.g. a
  skill installed only via `scripts/install-skills.mjs`, never uploaded as
  a ZIP).

Neither list is inferred from the other. A skill must declare both
explicitly and independently in `registry/skills-index.json`.

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
- **ChatGPT/Codex skill surfaces**: VERIFIED directly against
  `learn.chatgpt.com/docs/build-skills` on 2026-09-05, which distinguishes
  exactly two distribution surfaces in its own words: "Standalone skills are
  available in the ChatGPT desktop app, Codex CLI, and IDE extension" vs.
  "Skills bundled in plugins are also available in Chat and Work across
  ChatGPT on the web, desktop, and mobile." An earlier pass in this repo
  used unverified secondary-source terminology ("Personal Skills", "Plugin
  Directory upload") that did not hold up against this primary source and
  has been removed — see `adapters/chatgpt/README.md` for the corrected,
  citation-backed A/B/C breakdown (Standalone / plugin-bundled / OpenAI API
  project Skills) and exactly what is and isn't implemented for each. No
  automatic Hub -> ChatGPT-account or Hub -> OpenAI-API-project sync exists
  or is planned; any upload is always a manual, human-initiated step.
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
