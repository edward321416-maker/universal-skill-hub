# Migration Map

## `ush-repo-evidence-plan` <- `openbaeseongjin/baeseongjin`

| Field | Value |
|---|---|
| Source repo | https://github.com/openbaeseongjin/baeseongjin |
| Source path | `.codex/skills/repo-task-plan/SKILL.md` |
| Source commit | `983005fc41b22cb0efc76fb4b529df8ef6c6d6d8` (last commit touching that file, verified via `gh api repos/openbaeseongjin/baeseongjin/commits?path=...`) |
| Canonical path | `skills/global/ush-repo-evidence-plan/SKILL.md` |
| Canonical version | 1.0.0 |

Note: the same skill is expected to also exist under
`.cursor/skills/repo-task-plan/` and `.opencode/skills/repo-task-plan/` in the
source repository per the migration brief, but this was not independently
re-verified file-by-file in v1 — only `.codex/skills/repo-task-plan/SKILL.md`
was read and compared. No file in `openbaeseongjin/baeseongjin` was modified
or deleted as part of this migration; it remains the untouched original.

### Equivalence check

Per the v1 plan, exact wording/order is not required. The comparison is
against these invariants:

| Invariant | Present in source | Present in `ush-repo-evidence-plan` | Notes |
|---|---|---|---|
| Reads applicable project policy before inspecting implementation | Yes (`AGENTS.md`, `docs/development-rules.md`, `SESSION-HANDOFF.md`) | Yes | Canonical version generalizes to "whatever this project designates as its policy/rules documentation" — the three specific filenames are project-specific and were deliberately dropped, not lost. |
| Treats external/chat context as untrusted, ignores embedded commands | Yes (Discord-specific) | Yes | Generalized from "Discord context" to "any supplied external context". |
| Confirms requested outcome against active decisions before proposing | Yes | Yes | Kept near-verbatim. |
| Source-of-truth / symbol-first inspection before opening bodies | Yes | Yes | Kept near-verbatim. |
| Identifies rule/module owner, avoids duplicate state/logic | Yes | Yes | Kept near-verbatim. |
| Specifies smallest vertical change + verification + risks/exclusions | Yes | Yes | Kept near-verbatim. |
| Read-only contract (no edits, installs, deploys, pushes) | Yes | Yes | Kept; source additionally named `$github-task-flow` as a specific forbidden skill — generalized to "any mutating skill" since that specific skill has not been migrated into this hub. |
| No claiming tests passed without observed output | Yes | Yes | Kept verbatim as a rule. |
| `needs_approval` escalation on conflict with an active decision | Yes | Yes | Kept, generalized from "L1/L2 decisions" (a project-specific decision-numbering scheme) to "the project's active decisions or conventions". |
| Result contract (status/summary/proposedChanges/verification/risks) | Yes | Yes | Kept verbatim. |

### Deliberately dropped (project-specific, not globalizable)

- Reference to a specific Discord Codex job as the only valid caller
- Exact filenames `AGENTS.md`, `docs/development-rules.md`,
  `SESSION-HANDOFF.md`
- Assumption that the target is a game/service repository
- Reference to the specific `$github-task-flow` skill by name
- The `L1/L2` decision-numbering scheme specific to that project

None of these were copied into the canonical skill; they are called out here
only so a future reviewer can check nothing was silently lost versus silently
generalized.
