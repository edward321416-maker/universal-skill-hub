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
- **Registry-owned** (no canonical-source equivalent): `path`, `source_repo`,
  `source_path`, `source_commit`.
  - `runtime_support` is registry-owned and **authoritative** for runtime
    compatibility (see below).
  - `platforms` is registry-owned but only as a **backward-compatible
    mirror** of `runtime_support` — `scripts/registry-consistency.mjs`
    fails if the two sets ever diverge (order-independent set equality).
  - `runtime_exclusions` is registry-owned, sparse, evidence-backed
    negative/unverified runtime metadata.
  - `bundle_targets` remains registry-owned distribution/packaging
    metadata, independent of `runtime_support` (see below).
  - The central runtime-requirements vocabulary
    (`registry/runtime-requirements.json`) is authoritative for every
    capability/permission/tool identifier referenced anywhere in the
    registry.

## Runtime compatibility model (Phase 1.2 review round 4)

Round 3 settled `platforms` vs. `bundle_targets` as two independent
dimensions. Round 4 makes runtime compatibility itself evidence-backed
instead of an unexplained array of strings, and formally separates three
questions that used to be conflated in a single `platforms` array:

1. **Can this skill execute as a live routed task on this runtime?**
   -> `runtime_support` (authoritative) / `runtime_exclusions` (sparse,
   negative or unverified)
2. **Can a portable Skill artifact be produced for this packaging
   surface?** -> `bundle_targets` (unchanged from round 3)
3. **Does a filesystem adapter get generated for this runtime?** ->
   `scripts/render-adapters.mjs`'s `ADAPTER_TARGETS` (unchanged; a
   mechanical detail of *how* a supported runtime receives the file, not
   a fourth compatibility question)

None of the three is inferred from either of the others. A skill declares
each independently.

### `runtime_support` (authoritative) and `platforms` (mirror)

`runtime_support` is a map of runtime key -> `{ status, reason, evidence,
requires_at_runtime? }`:

- **`status`** is one of `SUPPORTED` or `SUPPORTED_WITH_RESTRICTIONS` only.
  Presence in `runtime_support` means the skill *can* execute on that
  runtime, possibly subject to conditions — it never means "assume those
  conditions hold." `UNSUPPORTED`/`UNVERIFIED` are not valid here; a
  negative or unresolved assessment belongs in `runtime_exclusions`
  instead (`scripts/registry-consistency.mjs` rejects them if misplaced).
- **`reason`** (required, non-empty) explains the conclusion.
- **`evidence`** (required, non-empty array of `{source_type, source,
  verified_on}`) explains *why* the conclusion is justified and lets
  someone re-check it later — see "Provenance" below.
- **`requires_at_runtime`** (optional; typed `{kind, id}` entries, see
  below) lists what a `SUPPORTED_WITH_RESTRICTIONS` runtime still needs at
  invocation time. It is documentation for that judgment, not an
  enforcement mechanism — the actual fail-closed enforcement is still
  `scripts/eligibility.mjs`'s `required_capabilities`/
  `required_permissions`/`required_tools`/`operationGates` checks, which
  run identically regardless of what `runtime_support` says. A runtime
  being `SUPPORTED_WITH_RESTRICTIONS` never bypasses those checks.

`platforms` remains for backward compatibility — existing code may keep
using `skill.platforms.includes(task.platform)` — but it is now **only** a
mirror of `runtime_support`'s keys. `scripts/registry-consistency.mjs`
enforces `set(platforms) === set(Object.keys(runtime_support))`
(order-independent) whenever a skill declares `runtime_support` at all.
A future implementation may derive `platforms` automatically from
`runtime_support` instead of storing both; Round 4 deliberately keeps both
fields to avoid a larger migration than this review asked for.

### `runtime_exclusions` (sparse, evidence-backed)

`runtime_exclusions` is a map of runtime key -> `{ status, reason,
evidence }` for a runtime surface that was **actually assessed** but did
not qualify for `runtime_support`:

- **`UNSUPPORTED`** = an authoritative assessment found the skill cannot
  currently execute on this runtime.
- **`UNVERIFIED`** = the runtime was investigated, but sufficient evidence
  for execution support could not be established.
- `SUPPORTED`/`SUPPORTED_WITH_RESTRICTIONS` are not valid here — a positive
  assessment belongs in `runtime_support`.

`runtime_exclusions` is **sparse by design**: only runtimes actually
reviewed appear here. A runtime absent from *both* `runtime_support` and
`runtime_exclusions` means **its compatibility has not been assessed at
all** — this is a distinct, third state, never conflated with `UNVERIFIED`
(which means "assessed, no evidence found") or `UNSUPPORTED` ("assessed,
found incompatible"). `scripts/registry-consistency.mjs` rejects any
overlap between the two maps' keys — a runtime cannot be simultaneously
supported and excluded.

All six current skills exclude `chatgpt` this way: `learn.chatgpt.com/docs/build-skills`
confirms the ChatGPT desktop app's Standalone Skills feature is real, but
the Hub implements no adapter or bundle target for that specific surface
(only the separate `openai-api` project-Skills surface, which does have an
implemented bundler) — so this repo cannot establish that a skill actually
executes there, hence `UNVERIFIED`, not silently omitted and not claimed
`SUPPORTED`.

### Central runtime-requirements vocabulary

`registry/runtime-requirements.json` is the single source of truth for
every capability/permission/tool identifier used anywhere in the registry,
namespaced by kind:

```
{ "capabilities": { "<id>": { "description": "..." } },
  "permissions":   { "<id>": { "description": "..." } },
  "tools":         { "<id>": { "description": "..." } } }
```

The same logical name can legitimately exist in more than one namespace
with different meaning — e.g. `capability:github_write` ("the provider
*can* write to GitHub") vs. `permission:github_write` ("the user/task
*authorized* a GitHub write"). The Hub never infers one from the other;
this is the same provider-capability-vs-UI-permission distinction that
`scripts/eligibility.mjs`'s `MISSING_CAPABILITY` vs. `MISSING_PERMISSION`
checks have enforced since Phase 1.2 (see the "host says allow all but the
provider is read-only" regression test in
`scripts/__tests__/migration-skills.test.mjs`).

`scripts/registry-consistency.mjs` validates every reference into this
vocabulary and fails on an unknown identifier — a typo like
`github-write`, `github_write_access`, or `git_diff_reader` is caught, not
silently accepted — across: `required_capabilities`/`required_permissions`/
`required_tools`, `operationGates[*].requiredCapabilities`/
`requiredPermissions`, and every `requires_at_runtime` entry (in both
`runtime_support` and `bundle_targets`). The vocabulary intentionally
covers only identifiers the Hub actually uses today (`github_write`,
`github_merge`, `message_publish`, `discord_send`, `network_access`,
`repository_evidence` as capabilities/permissions; `git_diff_read` as a
tool) — see `scripts/runtime-vocabulary.mjs`.

### Typed `requires_at_runtime`

Each `requires_at_runtime` entry is `{ kind: "capability"|"permission"|"tool",
id: "<vocabulary id>" }`, not a bare string. `scripts/registry-consistency.mjs`
rejects an unknown `kind`, an `id` not present in that kind's vocabulary
namespace (including a name registered under the *wrong* namespace, e.g.
`{kind: "capability", id: "github_merge"}` — `github_merge` is a
permission), and a duplicate `{kind, id}` pair within one entry's array.

### Provenance

Every `runtime_support`/`runtime_exclusions` entry requires an `evidence`
array of `{ source_type, source, verified_on }`, so a compatibility
judgment can be re-checked later instead of taken on faith:

- **`source_type`** is one of `official_docs` (a primary-source
  documentation page), `official_runtime_test` (a test run against the
  vendor's own hosted service), or `local_runtime_test` (a real install/
  invocation performed on this machine, e.g.
  `scripts/install-skills.mjs --apply` plus a confirmed Skill-tool
  discovery). Only these three are used today — the enum is deliberately
  small and grows only when a new kind of evidence is actually gathered.
- **`source`** names the actual document or test consulted — never a
  fabricated URL.
- **`verified_on`** is `YYYY-MM-DD`, the date that evidence was actually
  checked.

This preserves the CONFIRMED-vs-UNVERIFIED-vs-NOT-IMPLEMENTED discipline
used throughout this repo: a runtime is never marked `SUPPORTED` on the
strength of a doc page alone if what was actually verified was only a live
test, or vice versa — `source_type` records which one it was.

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
- **Cursor skill directory convention**: VERIFIED against official Cursor
  documentation on 2026-09-06 (`cursor.com/docs/skills`), which states
  skills are "automatically loaded from these locations": project-level
  `.agents/skills/` and `.cursor/skills/`; user-level `~/.agents/skills/`
  and `~/.cursor/skills/`; Cursor also reads `.claude/skills/` and
  `.codex/skills/` as compatibility paths. This was previously an
  unverified assumption baked into `ADAPTER_TARGETS` since Phase 1.1 —
  Phase 1.2 review round 4 checked it against the primary source for the
  first time and confirmed it.
- **OpenCode skill directory convention**: VERIFIED against official
  OpenCode documentation on 2026-09-06 (`opencode.ai/docs/skills/`),
  which lists the search locations: project `.opencode/skills/<name>/SKILL.md`,
  global `~/.config/opencode/skills/<name>/SKILL.md`, plus Claude- and
  agent-compatible paths (`.claude/skills/`, `~/.claude/skills/`,
  `.agents/skills/`, `~/.agents/skills/`). Same round-4 first-verification
  as Cursor above.
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
