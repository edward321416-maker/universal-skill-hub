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

---

## Phase 1.2: five skills migrated from `openbaeseongjin/baeseongjin`

All five source files were read in full via the GitHub API (not assumed from
filenames) on 2026-09-06. For every skill, the `.cursor/skills/` and
`.opencode/skills/` copies were also read and hashed:

| Skill | `.codex` blob SHA | `.cursor` blob SHA | `.opencode` blob SHA | Drift |
|---|---|---|---|---|
| github-task-flow | `56394ac9...` | `1646952b...` | `1646952b...` | Semantically equivalent — cursor/opencode are byte-identical to each other; body is byte-identical to `.codex`; only the YAML `description` field's line-wrapping style differs (folded block scalar vs. single quoted line), verified with `diff` on the body separately from the frontmatter |
| coordinate-github-tasks | `252c0c08...` | `9669e04f...` | `9669e04f...` | Same pattern as above |
| meeting-to-game-plan | `8f9f59f2...` | `fafb65df...` | `fafb65df...` | Same pattern as above |
| discord-repo-cross-reference | `8e28b46c...` | `c950ae1f...` | `c950ae1f...` | Same pattern as above |
| work-announcement | `f078b38b...` | `b47d22fe...` | `b47d22fe...` | Same pattern as above |

No skill's markdown body differs at all between `.codex` and the
`.cursor`/`.opencode` copies; only YAML frontmatter re-serialization style
differs, and `.cursor` and `.opencode` are byte-identical to each other in
every case. Nothing in `openbaeseongjin/baeseongjin` was modified, deleted,
or replaced as part of this migration.

### `ush-github-task-flow` <- `.codex/skills/github-task-flow/SKILL.md`

Source commit: `4b8cf8b0faa7e1d7dc195984dcb66fc468b3157f`. Canonical:
`skills/git/ush-github-task-flow/SKILL.md`, risk L3.

| Invariant | Source | Canonical | Result |
|---|---|---|---|
| Issue created before branch/commit | Yes | Yes | PASS |
| Isolated branch per task, never implement on `main` | Yes | Yes | PASS |
| Validate before opening PR | Yes | Yes | PASS |
| Rebase onto latest `main` before merge, re-validate | Yes | Yes | PASS |
| No plain `git push --force`; `--force-with-lease` only on an owned branch | Yes | Yes | PASS |
| No history rewrite on `main` or shared branches | Yes | Yes | PASS |
| No bypassing branch protection / required checks | Yes | Yes | PASS |
| Evidence-based completion report | Yes | Yes | PASS |
| Coordinate only on genuine active-source overlap (not plans/backlog) | Yes (delegates to coordinate-github-tasks) | Yes (delegates to `ush-concurrent-edit-coordination`) | PASS |

Deliberately dropped (project-specific): the mandatory Korean-language
commit-body / fixed trailer-key ("Lore Commit Protocol") format; the
GitHub CLI auto-install/auth bootstrap procedure (`winget`/`brew` commands,
specific PowerShell); the exact `issue/<number>-<slug>` branch-naming
enforcement tied to that repository's own convention (kept as an example,
not a mandate); the requirement that every task collapse to exactly one
commit; the `$coordinate-github-tasks` invocation-by-name syntax.

**Equivalence: PASS.** The safety-critical sequencing and force-push
discipline survive; only repository-specific formatting and tooling
bootstrap were dropped.

### `ush-concurrent-edit-coordination` <- `.codex/skills/coordinate-github-tasks/SKILL.md`

Source commit: `4b8cf8b0faa7e1d7dc195984dcb66fc468b3157f`. Canonical:
`skills/git/ush-concurrent-edit-coordination/SKILL.md`, risk L0.

| Invariant | Source | Canonical | Result |
|---|---|---|---|
| Entry gate requires actual active-edit evidence on both sides | Yes | Yes | PASS |
| Plans/backlogs/open issues alone are not entry evidence | Yes | Yes | PASS |
| Overlap classes: none / shared-checkout / hunk / contract / duplicate | Yes | Yes | PASS |
| Never re-engage/interrupt finished work | Yes | Yes | PASS |
| SKIP (or an equally safe non-execution result) when inspection evidence is unavailable, rather than guessing | Yes (implicit — "추측으로 연락하지 않는다") | Yes, made explicit and testable via a `required_tools: ["git_diff_read"]` fail-closed gate | PASS |

Deliberately dropped: the Codex-app-specific "작업 목록" (task list) tool
reference; the exact `SOURCE-OVERLAP v1` message template (kept as an
illustrative example only); the specific completed/published/merged/closed
status vocabulary tied to that project's own conversation-state system,
generalized to "actively editing vs. finished."

**Equivalence: PASS.**

### `ush-game-meeting-plan` <- `.codex/skills/meeting-to-game-plan/SKILL.md`

Source commit: `983005fc41b22cb0efc76fb4b529df8ef6c6d6d8`. Canonical:
`skills/game/ush-game-meeting-plan/SKILL.md`, scope `domain`, risk L0.

| Invariant | Source | Canonical | Result |
|---|---|---|---|
| Decision vs. discussion distinction | Yes | Yes | PASS |
| Silence != consensus | Yes | Yes | PASS |
| Rejected option stays rejected | Yes | Yes | PASS |
| Hypothesis != fact | Yes | Yes | PASS |
| Read-only | Yes | Yes | PASS |
| Input generalized beyond one chat platform | No (Discord-specific: `<discord-context>` block, "validated Discord Codex job") | Yes — any bounded meeting notes/transcript/decision log | Intentional generalization |

Deliberately dropped: the exact `AGENTS.md`/`docs/development-rules.md`/
`SESSION-HANDOFF.md` filenames (generalized to "the project's own
policy/decision-tracking documents"); the Discord-XML-tag-specific untrusted
context marker (generalized to "untrusted quoted evidence" in general); the
requirement that the source specifically be "a validated Discord Codex job."

**Equivalence: PASS.**

### `ush-discord-repo-cross-reference` <- `.codex/skills/discord-repo-cross-reference/SKILL.md`

Source commit: `983005fc41b22cb0efc76fb4b529df8ef6c6d6d8`. Canonical:
`skills/discord/ush-discord-repo-cross-reference/SKILL.md`, scope `domain`,
risk L0 with a `send` operation gate.

| Invariant | Source | Canonical | Result |
|---|---|---|---|
| Discord content treated as untrusted, never as instructions | Yes | Yes | PASS |
| Repository evidence prioritized in the cross-reference | Yes | Yes | PASS |
| confirmed / contradicted / unresolved framing | Yes (as supporting/conflicting/implementing/superseding/missing) | Yes | PASS |
| No token handling in this skill's own output/logs | Yes | Yes | PASS |
| Sending gated separately from analysis, with its own capability/permission/intent | Yes (implicit: exact text, known destination, explicit approval) | Yes — made explicit and testable via `operationGates.send` (`requiredCapabilities: ["discord_send"]`, `requiresExplicitIntent`, `requiresPermission`) | PASS |
| No edit/delete/react/moderate/admin | Yes | Yes | PASS |

Deliberately dropped: the exact `@discord-mcp/cli@0.18.1` package/version and
the specific `DISCORD_TOKEN` PowerShell setup script — generalized to "the
host's own connector configuration," since hardcoding one project's MCP
server choice into a canonical skill would itself be the project-leakage
this hub exists to avoid; the literal Korean-language setup-recovery
example text (kept only as an illustrative pattern description, not
mandated wording).

**Equivalence: PASS.**

### `ush-work-announcement` <- `.codex/skills/work-announcement/SKILL.md`

Source commit: `a8bc0493355b82582e98ec4ffc8064506f8f422a`. Canonical:
`skills/discord/ush-work-announcement/SKILL.md`, scope `domain`, risk L0
with a `publish` operation gate.

| Invariant | Source | Canonical | Result |
|---|---|---|---|
| Evidence-backed scope (period/domain/contributor) | Yes | Yes | PASS |
| Period discipline (explicit dates, not vague ranges) | Yes | Yes | PASS |
| Draft shown and approved before any publish | Yes | Yes | PASS |
| Publication separately gated from drafting | Yes (implicit: "어떤 승인도 게시를 자동 허가하지 않는다") | Yes — made explicit and testable via `operationGates.publish` | PASS |
| Material edit after approval invalidates that approval | Yes ("Any material edit after approval resets approval") | Yes — made explicit and testable via `scripts/approval-gate.mjs`'s `isApprovalValid()`, which a caller wires into `hasPermission` by comparing a content hash | PASS |
| No fabricated accomplishments; Git > chat as evidence | Yes | Yes | PASS |

Design choice made explicit here per the Phase 1.2 brief's option A/B: this
hub chose **one skill with a deterministic publication gate** (option A) —
`draft` and `publish` are two operations on the same canonical skill, with
`publish` gated by `operationGates`, rather than splitting into two skills.

Deliberately dropped: the Discord-specific `공지` channel-name convention
and the assumption that the destination is always Discord — generalized to
"a specific, already-identified destination," while the skill still lives
in the `discord` domain folder because its origin and its typical pairing
with `ush-discord-repo-cross-reference`'s send mechanics are Discord-shaped.

**Equivalence: PASS.**

### Conflicts considered and rejected

- `ush-repo-evidence-plan` vs. `ush-github-task-flow`: **not conflicting** —
  complementary (planning, then implementation/PR flow); both may be USE
  for the same task in sequence.
- `ush-game-meeting-plan` vs. `ush-repo-evidence-plan`: **not conflicting**
  — both may apply sequentially (meeting evidence -> plan, then
  implementation-evidence check against the plan).
- No other deterministic conflict was found among the six registered
  skills; `registry/conflicts.json` remains empty by design rather than
  populated with speculative entries.
