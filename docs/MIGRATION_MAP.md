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
`skills/git/ush-github-task-flow/SKILL.md`, risk L3, v1.1.0.

**Important correction (Phase 1.2 review round 2):** the source skill's own
invocation contract states that calling it with no further qualification
means *"현재 작업을 GitHub 이력으로 만들고 병합해줘"* ("turn the current work
into GitHub history and merge it") and its workflow proceeds through an
actual merge (§8, "일반 merge commit으로 병합한다") without a separate
merge-specific authorization step — that is a legitimate, explicit design
choice *for that one project*, where the operator invoking the skill was
understood to already mean "and merge it." Generalizing that same implicit
authorization into a canonical Hub skill would be incorrect: a Hub caller
saying "implement issue #42, test it, and open a PR" has not said "and
merge it," and this hub cannot assume the equivalent of that project's
specific invocation contract for every caller. The canonical skill
therefore does **not** inherit automatic merging — v1.0.0 of this migration
did so unintentionally (its default workflow proceeded through Step 8
"merge using the repository's normal PR merge path" without a gate) and
that was a real overclaim, corrected in v1.1.0 below.

| Invariant | Source | Canonical v1.1.0 | Result |
|---|---|---|---|
| Issue/task identity resolved before new branch/commit | Yes (always creates a new issue) | Yes — generalized: reuse an already-supplied issue, create one only if none exists (never a duplicate) | PASS (generalized) |
| Isolated branch per task, never implement on `main` | Yes | Yes | PASS |
| Validate before opening PR | Yes | Yes | PASS |
| PR delivery does not imply merge | **No — source explicitly merges as part of one continuous authorized flow** | Yes — `deliver_pr` (default) ends at an open, validated PR; `merge` is a separate operation gated by `operationGates.merge` (explicit intent + named `github_merge` permission + `github_write` capability) | **Deliberate divergence, not a gap** — see correction above |
| Merge preparation (rebase check, required-checks/review status) reported without merging | Partially (source's rebase-and-revalidate step is folded into its one authorized flow) | Yes — explicit `deliver_pr` step 7 | PASS (generalized into its own step) |
| No plain `git push --force`; `--force-with-lease` only on an owned branch | Yes | Yes | PASS |
| No history rewrite on `main` or shared branches | Yes | Yes | PASS |
| No bypassing branch protection / required checks | Yes | Yes | PASS |
| Evidence-based completion report; PR-delivered vs. merged always distinguished | Yes (report distinguishes steps, though merge already happened by then) | Yes — Result Contract explicitly reports "delivered (open, not merged)" vs. "merged" as distinct states | PASS |
| Coordinate only on genuine active-source overlap (not plans/backlog) | Yes (delegates to coordinate-github-tasks) | Yes (delegates to `ush-concurrent-edit-coordination`) | PASS |

Deliberately dropped (project-specific): the mandatory Korean-language
commit-body / fixed trailer-key ("Lore Commit Protocol") format; the
GitHub CLI auto-install/auth bootstrap procedure (`winget`/`brew` commands,
specific PowerShell); the exact `issue/<number>-<slug>` branch-naming
enforcement tied to that repository's own convention (kept as an example,
not a mandate); the requirement that every task collapse to exactly one
commit; the `$coordinate-github-tasks` invocation-by-name syntax; **the
implicit "deliver = merge" authorization contract** (this is the one
genuinely intentional behavioral divergence in this migration, not an
oversight — see the correction above).

**Equivalence: PASS**, with one deliberate, documented divergence (PR
delivery no longer implies merge). The safety-critical sequencing and
force-push discipline survive unchanged; the merge-authorization boundary
was deliberately made stricter, not preserved as-is, because the source's
implicit authorization was itself project-specific and not safe to
generalize.

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
| Material edit after approval invalidates that approval | Yes ("Any material edit after approval resets approval") | **Corrected in the review-2 pass to be actually deterministic**, not just documented — see note below | PASS (as of the correction; PARTIAL/overclaim before it) |
| No fabricated accomplishments; Git > chat as evidence | Yes | Yes | PASS |

**Correction (Phase 1.2 review round 2):** the first migration pass called
this "PASS" via `scripts/approval-gate.mjs`'s `isApprovalValid()`, but
`evaluateEligibility()` never actually called it — the deterministic gate
only checked `task.hasPermission`, a generic boolean the *caller* was
trusted to set correctly after doing its own hash comparison. That was an
overclaim: nothing prevented a caller from setting `hasPermission: true`
without ever checking the hash. `operationGates.publish` now declares
`requiresApprovedContentMatch: true`, and `evaluateEligibility()` itself
compares `task.approvedContentHash` against `task.currentContentHash` (via
`isApprovalValid()`) and BLOCKs (`OPERATION_NO_APPROVED_CONTENT` /
`OPERATION_APPROVAL_STALE`) if they don't match — the engine enforces this
now, not merely a documented caller convention.

**Also corrected:** the publish gate's capability/permission were
initially declared as `discord_send`, contradicting this skill's own
canonical body, which explicitly generalizes the destination beyond
Discord ("a chat channel is only the approved publication destination").
Both are now `message_publish` — a destination-agnostic name — so the
canonical text and the enforced gate agree. (Contrast
`ush-discord-repo-cross-reference`, which intentionally keeps `discord_send`
— it is a Discord domain skill by design, not a generalized one.)

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

### Bundle support matrix (per-skill, per-target — Phase 1.2 review round 2)

`skill.platforms` (runtime CLI/IDE support: codex/claude-code/cursor/
opencode) and `skill.bundle_targets` (claude.ai / OpenAI API project-Skills
packaging) are separate models — see `docs/DESIGN.md`. A skill's bundle
eligibility was re-evaluated individually per skill, not blanket-excluded
because it originated in a coding-agent skill set (an earlier pass in this
migration did exactly that overbroad exclusion; corrected here):

| Skill | `claude-ai` | `openai-api` | Why |
|---|---|---|---|
| `ush-repo-evidence-plan` | SUPPORTED | SUPPORTED | Pure read-only reasoning over supplied evidence; no live-network/connector need |
| `ush-github-task-flow` | SUPPORTED_WITH_RESTRICTIONS | SUPPORTED_WITH_RESTRICTIONS | claude.ai's network access varies by user/admin setting (Anthropic docs) — GitHub write depends on that being enabled; the OpenAI Responses API supports function tools and remote MCP servers alongside Skills, so a caller *can* supply an authenticated GitHub-write tool, though OpenAI provides none built in (corrected in review round 2 — this cell previously read UNSUPPORTED, which predated that check) |
| `ush-concurrent-edit-coordination` | SUPPORTED_WITH_RESTRICTIONS | SUPPORTED_WITH_RESTRICTIONS | Packaging is fine; the deterministic `required_tools: git_diff_read` gate already BLOCKs at runtime if the deployment can't actually supply diff evidence — packaging and runtime-tool-availability are different questions |
| `ush-game-meeting-plan` | SUPPORTED | SUPPORTED | L0 read-only planning over supplied bounded evidence; repository cross-check is explicitly optional/conditional (see the skill body's step 5) |
| `ush-discord-repo-cross-reference` | SUPPORTED_WITH_RESTRICTIONS | SUPPORTED_WITH_RESTRICTIONS | Analyzing already-supplied Discord evidence needs no live connector; only the separately-gated `send` operation needs `discord_send`, already enforced by `operationGates.send` at runtime |
| `ush-work-announcement` | SUPPORTED_WITH_RESTRICTIONS | SUPPORTED_WITH_RESTRICTIONS | Drafting from supplied/live history is L0; `publish` is separately gated and needs a generic `message_publish` capability the deployment may or may not have configured |

Every `UNSUPPORTED` and `SUPPORTED_WITH_RESTRICTIONS` entry carries a
machine-readable `reason` in `registry/skills-index.json`, enforced by
`scripts/registry-consistency.mjs`'s enum + non-empty-reason check.

### Runtime support matrix (per-skill, per-runtime — Phase 1.2 review round 4)

`runtime_support`/`runtime_exclusions` answer a different question than
the bundle matrix above: not "can this be packaged," but "can this
actually execute as a live routed task on this runtime" — see
`docs/DESIGN.md`'s "Runtime compatibility model" section. All six skills
share the same runtime shape, since none has a host-specific requirement
beyond its own declared capabilities/permissions/tools:

| Runtime | Status (all 6 skills) | Evidence |
|---|---|---|
| `codex` | SUPPORTED (SUPPORTED_WITH_RESTRICTIONS for skills needing a runtime capability, e.g. `ush-github-task-flow`'s `github_write`) | official_docs: `developers.openai.com/codex/skills`, 2026-09-05; local_runtime_test: real `--apply` install, byte-identical |
| `claude-code` | same pattern | local_runtime_test: real `--apply` install; Skill tool listing confirmed discovery within this session |
| `cursor` | same pattern | official_docs: `cursor.com/docs/skills`, 2026-09-06 — confirms `.cursor/skills/` and `.agents/skills/` (project + user level) |
| `opencode` | same pattern | official_docs: `opencode.ai/docs/skills/`, 2026-09-06 — confirms `.opencode/skills/` (project) and `~/.config/opencode/skills/` (global) |
| `claude-ai` | same pattern | official_docs: `support.claude.com`/`platform.claude.com`, 2026-09-05 |
| `openai-api` | same pattern | official_docs: `developers.openai.com/api/docs/guides/tools-skills`, 2026-09-05 |
| `chatgpt` | **excluded**, UNVERIFIED (all 6 skills) | official_docs: `learn.chatgpt.com/docs/build-skills` confirms the ChatGPT desktop app's Standalone Skills feature is real, but the Hub implements no adapter or bundle target for that specific surface — execution there cannot be established from this repo |

**Materially changed from round 3:** `ush-repo-evidence-plan`'s `platforms`
previously listed `chatgpt` (not `openai-api`) as a live-routable surface —
an unexamined carry-over from before `runtime_support`/`runtime_exclusions`
existed. Round 4 corrected this: `chatgpt` moved to `runtime_exclusions`
(`UNVERIFIED`, per the table above) and `openai-api` was added to both
`runtime_support` and `platforms`, matching its already-`SUPPORTED` bundle
status and the actual OpenAI API Skills mechanism this repo implements.
`cursor` and `opencode` gained explicit `runtime_support` entries (with
real official-docs evidence gathered in round 4, not merely assumed) for
all six skills; `claude-ai`/`openai-api` were likewise added to `platforms`
for the five skills that previously omitted them, mirroring their
already-`SUPPORTED`/`SUPPORTED_WITH_RESTRICTIONS` `bundle_targets` status.
No skill's `bundle_targets` values changed in this round (item 13:
`runtime_support` and `bundle_targets` remain independently assessed).

**Materially changed in the round 4 final patch (blocker 3):**
`ush-discord-repo-cross-reference`'s and `ush-work-announcement`'s
`runtime_support`/`bundle_targets` entries previously duplicated their
operation-gated requirements (`discord_send`, `message_publish`) into
`requires_at_runtime`, even though those requirements apply only to the
separately-gated `send`/`publish` operations, not to the skills'
general/default behavior. Corrected: `discord_send` was removed from
`ush-discord-repo-cross-reference`'s `requires_at_runtime` entirely (its
default `analyze` operation needs nothing) — it remains, unchanged, in
`operationGates.send`. `message_publish` was removed from
`ush-work-announcement`'s `requires_at_runtime` (its default `draft`
operation doesn't need it) while `repository_evidence` correctly stays
(drafting genuinely needs it generally) — `message_publish` remains,
unchanged, in `operationGates.publish`. Neither skill's actual eligibility
behavior changed — `scripts/eligibility.mjs` never reads `runtime_support`
or `bundle_targets`, only `operationGates`, which were untouched.

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
