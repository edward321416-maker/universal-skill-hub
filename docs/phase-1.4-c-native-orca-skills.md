# Phase 1.4-C: native ORCA skills integration

Status: partial; Decision 17 acceptance is not complete. Tracks issue #11; issue #9 stays open because Phase 1.4-B is
still partial. Base `744a8ecc0ce36528a8da550d6f954446b11b1071` (PR #8 and #10
merged). No merge is performed or authorized in this phase. Canonical bodies,
registered hashes, EXPERIMENTAL lifecycle and Phase 1.3 routing evidence are
unchanged.

## Runtime audit

The installed runtime is **ORCA 1.4.200**, already the target version, so no
update, reinstall or restart was performed and no active session was touched.
`ORCA_CLI_COMMAND` is unset and this is not an Orca dev checkout, so the
executable resolves to the installed CLI at
`…/Programs/orca/resources/bin/orca.exe`. `orca status --json` reports app
running, runtime `ready`/`connected`, `appVersion 1.4.200`, host `local`
(win32). Windows only; nothing here is evidence about WSL, SSH or remote hosts.

Unlike the Phase 1.4-B Codex sandbox, which could not even stat this executable
(EPERM, `engineEntered:false`), the Claude Code session running this phase can
execute it. That is a difference in execution environment, not a fix to the
1.4-B bridge, which remains blocked from inside Codex.

Native skill surfaces actually present: `skills installed`, `skills list`,
`skills get`, `skills install`, `skills update`, `skills share`. Publication via
`skills share` was never invoked and no sharing permission was enabled.

## The native installer contract — DIRECT_COMPATIBLE

`orca skills install` is a thin wrapper. Its `--dry-run --json` resolves to:

```
npx --yes skills add https://github.com/stablyai/orca --skill <name> --global \
  --agent claude-code --agent codex --agent cursor --agent universal -y
```

`--skill` is restricted to Orca's own bundled registry, so `orca skills install`
cannot install Hub skills. The mechanism underneath it — the community `skills`
CLI, installing from a repository — can.

Probed against the local checkout at this phase's base SHA,
`skills add <hub> --list` reports **Found 6 skills**: exactly the six `ush-*`
ids with their canonical names and descriptions. The 24 generated adapter
`SKILL.md` files and every internal directory are **not** exposed as skills.

**Result: DIRECT_COMPATIBLE. No export surface was added** and no canonical
directory was restructured.

### What the native path installs

It installs the **canonical** body, not the generated adapter. Measured against
`registry/skills-index.json`, a native install is byte-equal to the registered
`content_sha256` for **6/6** skills, LF preserved, no BOM or newline rewriting.

That is a stronger provenance anchor than the Hub's own installer output for
this purpose — the registry already tracks canonical hashes authoritatively —
but it is a real divergence: `scripts/install-skills.mjs` places **adapters**,
which carry generated provenance (`canonical_content_sha256`, `source_commit`,
the GENERATED banner). The two paths therefore produce different bytes by
design, and a target deployed by one is "drifted" from the other's expectation.

The CLI also writes a project `skills-lock.json` recording per-skill `source`,
`sourceType` and a `computedHash`.

### Conflict behavior — the gap the Hub must keep

The native installer is a **sync-to-source** operation:

- Reinstalling an unchanged target is genuinely idempotent: content and mtime
  both unchanged, no rewrite.
- A target whose bytes differ is **rewritten to canonical**. A local edit is
  destroyed. The plan output does print `overwrites: <target>`, but Orca's own
  resolved command passes `--yes` and `-y`, so that disclosure is auto-confirmed
  on the non-interactive path Orca actually uses.

Hub `deploy()` refuses the same situation with `CONFLICT` and changes nothing.
Native removal is likewise not preimage-exact: `skills remove --skill '*'`
removed all six but left an empty `.agents/` and `skills-lock.json` behind.

## Placement and discovery

Global scope was validated in an **isolated HOME**, leaving the real home
directory untouched (verified: real `~/.agents` mtime unchanged). Passing Orca's
exact agent list:

| Provider folder | ush-* placed | canonical byte parity |
| --- | --- | --- |
| `.agents` (shared) | 6 | 6/6 |
| `.claude` | 6 | 6/6 |
| `.codex` | 0 | — |
| `.cursor` | 0 | — |

So **codex and cursor are served by the shared `.agents/skills` directory and
only claude-code receives a separate placement**, even when named explicitly.

Workspace scope was validated in a disposable project and in the ORCA-registered
synthetic probe project: exactly six placements, no unrelated file modified, and
the fixture was afterwards restored to its exact preimage (0 dirty entries).

`orca skills installed` is **context-scoped**, not a global inventory. From the
Hub worktree it reports `repo :: Repo …universal-skill-hub.git .agents (6)`;
from the synthetic project's cwd the same command reports
`repo :: Repo new-project .agents (6)` instead. Home-scope entries
(`Agent skills home`, `Cursor home`, `Claude home`) appear in both. A
workspace-scope install is therefore only discoverable from inside that
workspace's context.

Recorded separately, never collapsed into one flag:

| Dimension | Result |
| --- | --- |
| Installed | ACTUAL — 6/6, global (isolated HOME) and workspace |
| Byte parity | ACTUAL — 6/6 against registered canonical `content_sha256` |
| Discovered | ACTUAL — native `orca skills installed`, context-scoped |
| Model-visible | ACTUAL for Claude Code (this session lists the six ush-* skills) |
| Explicitly loaded | ACTUAL — exact installed `SKILL.md` read and hash-matched |
| Implicitly selected | NOT TESTED — deferred, Codex quota exhausted |

## Existing-project and new-project E2E

| Target | Outcome |
| --- | --- |
| Synthetic ORCA-registered project (`probes/new-project`) | ACTUAL. Clean before; six installed; discovery confirmed from its own context; native removal tested; restored to exact preimage. |
| Existing project `final-check` | READ-ONLY AUDIT ONLY. Holds **codex-adapter** bytes for 6/6, so a native install would rewrite all six. Working tree was already dirty (3 entries). Not installed. |
| Existing project `decode` | **BLOCKED_PROJECT_LOCK**. Carries its own `AGENTS.md` and `CLAUDE.md` (the locked D021 thin-router policy) and a dirty tree (4 entries). Not touched. |

Only one of the two requested existing projects was even safe to audit, and
neither received a native install. This is not two existing-project E2Es.

**Worktree inheritance: NO.** A git worktree created manually from the same repo
is not auto-registered with ORCA — `orca worktree list` knows four Hub worktrees
and not this phase's — and the new worktree contained no `.agents/` at all.
Repository scope does not imply worktree scope.

**New-repo auto-enrollment: NOT OBSERVED.** Nothing was inherited automatically;
every placement in this phase required an explicit install command.

## Bootstrap disposition

Native parity is proven for placement, discovery and update only. Nothing is
deleted in this phase.

| Component | Disposition | Basis |
| --- | --- | --- |
| `orca-bootstrap.mjs` placement/install | DEPRECATE_AFTER_PARITY | Native install covers placement and is idempotent, but installs canonical where this installs adapters. Migration from already-deployed adapter state is unproven. |
| `orca-bootstrap.mjs` conflict detection (`CONFLICT`) | KEEP_AUTHORITATIVE | Native rewrites differing targets under `-y`. No equivalent refusal exists. |
| `orca-bootstrap.mjs` policy handling (`POLICY_REVIEW`/`POLICY_CONFLICT`) | KEEP_AUTHORITATIVE | The native CLI has no project-policy concept at all. |
| `orca-launcher.mjs` | KEEP_FALLBACK | Its in-agent ORCA bridge is still blocked from the Codex sandbox; unchanged by this phase. |
| `orca-seal-release.mjs` + release manifest/version validation | KEEP_AUTHORITATIVE | `skills-lock.json` records a source and a computed hash but does not pin an approved release, verify origin/cleanliness, or fail closed on an uninterpretable format. |
| UTF-8 selected-skill reader | KEEP_FALLBACK | Fixes a Codex-sandbox transport defect that native placement does not address. |
| Preimage rollback | KEEP_AUTHORITATIVE | Native removal left residue and restores nothing. |
| Eligibility bridge | KEEP_AUTHORITATIVE | ORCA exposes no eligibility contract. Still **ADVISORY**, not host-enforced. |
| Local receipts | KEEP_AUTHORITATIVE | The only artifact carrying the preimage needed to undo a deployment. |

## Routing policy after native installation

Native discovery exposes each skill's `name` and `description` (verified in
`orca skills installed --json`), which is what semantic selection needs. No
additional router is warranted, no LLM router was added, and no skill body is
injected into prompts.

The existing rule is preserved unchanged: the user need not name a Hub skill;
only materially relevant candidates are considered; the selected `SKILL.md` must
actually be read successfully before its workflow is claimed; and an unrelated
task uses no Hub skill.

Deterministic eligibility and semantic selection stay conceptually separate —
eligibility decides whether a candidate *may* be considered, semantic matching
decides relevance among eligible candidates. ORCA provides no hook to run the
Hub evaluator before selection, so at the host level this remains
**INSTRUCTION_ONLY**; the evaluator is enforceable only where a caller invokes
it. No project policy was mass-edited and the DECODE lock was not modified.

## `scripts/native-parity.mjs`

The one Hub-side addition, built RED→GREEN from the evidence above. It answers,
before the native installer runs, what that installer would rewrite:

- `inspectNativePlacement({ targetRoot, registry, folder })` classifies every
  registered skill as `MATCH_CANONICAL`, `DRIFTED` or `ABSENT`, and reports
  unmanaged sibling directories.
- `planNativeInstall(...)` returns `willCreate` / `willRewrite` / `unchanged`
  and `safe`, which is false whenever anything would be rewritten. It has no
  removal plan at all — unmanaged siblings are reported, never scheduled.

It reuses the existing `safePath`/`digest` rather than duplicating them, so path
escape and symlink redirection are refused on the existing contract.

Applied to actually observed state: the real global `~/.agents` reports
`safe=false, willRewrite=6` with 207 unmanaged siblings untouched; `final-check`
reports `safe=false, willRewrite=6`; natively installed targets report
`safe=true, unchanged=6`; a clean project reports `safe=true, willCreate=6`.

**Known limitation:** on this host `~/.claude` is itself a symlink, so
inspecting the claude-code global folder raises `SYMLINK` from the inherited
guard. The guard was deliberately not weakened; that global folder is simply not
inspectable under the current contract.

## Settings audit

**UNASSESSED for this phase.** The 312-row denominator and its outcomes live in
local redacted receipts outside Git, and that artifact was not available to this
session, so no row was re-evaluated and no count is restated here. The prior
1.4-B totals are dated history, not a current claim. What is established is only
that the runtime moved 1.4.198 → 1.4.200 and that the `orca skills *` surfaces
listed above are present — which is the input a future re-run needs, not a
re-run. Re-evaluating rows previously marked UNSUPPORTED because 1.4.198 lacked
a surface remains open work; none were flipped automatically.

## Open

- Codex implicit-selection gaps remain historical; Decision 17 prohibits live/paid Codex reruns in this phase.
- Two existing-project native E2Es; one is blocked by a project lock.
- Migration from already-deployed adapter state to canonical native state.
- The 312-row settings audit re-run against 1.4.200.
- `~/.claude` global inspection under the symlink guard.
- In-agent ORCA bridge access from the Codex sandbox, unchanged from 1.4-B.

## Skill Context Budget and Dynamic Project Scoping

### Decision 17 — acceptance amendment

This amendment supersedes any interpretation of the earlier six-skill global
installation experiment as the production architecture. Earlier runtime results
above remain dated evidence, not proof of this amendment. Keep Draft PR #12;
do not create another phase/PR, merge, or promote any lifecycle state.

```text
Hub Library
→ Project Scoper
→ Native ORCA Local Placement
→ Runtime-visible Candidate Set
→ Native Task Selection
→ SKILL.md Load
```

`INSTALLED`, `MODEL_VISIBLE`, and `SELECTED/LOADED` are independent. Installing
the entire library, or requiring the user to name a skill every time, does not
satisfy automatic-use acceptance. Global placement is only a compatibility
control, explicitly user-selected global installation, or a separately approved
universal skill. Project-local materialization is a generated view; canonical
Hub files and hashes remain authoritative.

### Baseline and quota-free diagnostics

Preserve the exact user-supplied historical Claude warning:

```text
Exceeded skills context budget.
All skill descriptions were removed and 66 additional skills were not included in the model-visible skills list.
```

The available previous transcript contains this text in a **user message** at
2026-09-12T09:21:49.247Z, not a recovered runtime warning event. Historical
exclusions reported: 66. Historical discovered/visible totals and exact
reproduction: **UNVERIFIED**. Do not relabel this as a fresh reproduction.

Fresh quota-free commands on 2026-09-12: `claude --version` reports 2.1.225;
`claude doctor` reports installation health only, without a discovery/budget
denominator. `orca status --json` reports 1.4.200 ready/connected.
`orca skills install --skill orca-cli --local --agent claude-code --dry-run --json`
reports `global:false`, `executed:false`. The native bundled-skill wrapper still
does not accept arbitrary Hub IDs. No new installer or account was acquired.

The [official Claude skills documentation](https://code.claude.com/docs/en/skills)
describes project `.claude/skills`, user and managed roots, plugin discovery,
`--debug`, `/context`, and version-dependent listing truncation. Current online
documentation is not proof of installed-version behavior. No undocumented
numeric runtime limit is embedded in the scoper; no budget setting was raised.
Codex Phase 1.3 overflow/alphabetical-truncation history remains unchanged and
is not extrapolated to Claude. No Codex inference subprocess was run.

Disk inventory and runtime discovery have different denominators. Direct home
folders contained 145 Claude skill files (63,263 description bytes), and 213
shared `.agents` skill files (92,871 bytes). Recursive disk searches found 203,
279 and 4,135 `SKILL.md` paths under Claude skills, shared skills and the plugin
tree respectively, including nested/cache copies; these are **not** active skill
counts. Duplicate direct Claude names included `gstack` and `open-gstack-browser`.
Third-party files were not deleted, overwritten, disabled or reorganized.

### Deterministic startup scoper

`scripts/project-scoping.mjs` exports `scopeProject()` and a read-only JSON CLI:

```text
node scripts/project-scoping.mjs <project-context.json>
```

Input includes identity, `project_scope`, detected runtime, policy, available
inputs/tools/capabilities, known granted permissions, and optional observed
budget signal. It checks registry runtime support/exclusions, required inputs,
tools, capabilities, permissions, runtime requirements, risk and lifecycle.
Unknown runtime support or availability fails closed. Existing
`evaluateEligibility()` and conflicts remain authoritative. No task intent or
permission is invented at startup. A high-risk candidate is `RESTRICTED`, never
automatically authorized. All task operations must later be evaluated again,
including merge/send/publish and the approved-content hash gate.

Project-wide `required_permissions` still exclude a skill when unavailable.
An operation-only merge permission does not remove an otherwise usable skill.
For the real GitHub workflow, `github_write` is currently a general registry
prerequisite; this amendment does not quietly reclassify it as operation-only.
Protected-resource operation conflicts and project denials exclude candidates.
DECODE's review-pending audit restriction is explicit input, not an assertion
that its policy literally denies all six Hub skills.

Domain skills need declared project scope or a project allow/enable list;
descriptions are never used to guess project semantics. Existing metadata has
no sufficiently rich domain taxonomy, so no speculative LLM/embedding router
is introduced. Priority: explicit enable, exact scope, full runtime support,
unrestricted requirements, declared domain applicability, then general fallback.
ID ordering is only a deterministic final tie-break. Duplicate IDs are all
excluded rather than selecting an arbitrary definition.

Project policy may set `maxCandidates` or `maxDescriptionBytes`. These are
explicit project allocations, **not Claude limits**. Accounting includes Unicode
characters and UTF-8 description bytes. Budget exclusions are reported. Without
a runtime observation the status is `UNVERIFIED`, even if all local checks pass;
an observed overflow produces `BLOCKED_OVERFLOW` and prevents apply.

### Placement and reconciliation

`reconcileProject()` places only candidates in the official local root:
`.claude/skills` for Claude or `.agents/skills` for Codex. This phase exercised
Claude placement only. Because native sync overwrites edits, the implementation
uses an exact-canonical-file fallback to the same native filesystem convention;
it does not claim an ORCA Hub-install API or automatic startup integration.

The sidecar `.ush-project-scope.json` records owner, version, project, runtime,
skill ID and exact installed hash. This reuses the installer ID/platform
ownership contract and bootstrap's exact-preimage principle plus `safePath()`
and `digest()`. Native canonical files have no adapter marker, so a receipt is
required: existing copies without one are not adopted, even when byte-identical.
No canonical text or registered hash is changed to add a marker.

Every reconciliation recomputes from current Hub metadata, policy, runtime and
availability. All source hashes and existing preimages are checked before writes.
Managed unchanged/stale copies can remain/update; edited or missing owned files,
extra user files, symlink redirection and unmanaged collisions fail closed.
No-longer-eligible exact managed files require explicit removal confirmation;
removal is one known file plus an empty directory, never recursive cleanup.
Unrelated unmanaged siblings remain untouched. The lock serializes cooperating
scopers; this is not an OS security boundary. An I/O failure midway through apply
can leave partial placement; the next run conflicts against the old receipt.
Transactional recovery and supporting-file tree ownership remain limitations;
skills with supporting files are explicitly refused, not incompletely copied.

### Real project calculations and fresh Claude sessions

Reproduce the read-only existing-project audit and new synthetic fixture with:

```text
node scripts/project-scoping-audit.mjs <final-check-root> <decode-root> <output.json>
```

The command parses available manifests without executing scripts. It never
changes either existing project. Machine-readable inputs, exclusions, inventory
and metrics are in `phase-1.4-c-decision17-evidence.json`.

| Project | Hub total | Candidates | Claude local Hub files | Reduction | Result |
| --- | ---: | ---: | ---: | ---: | --- |
| Phase 1.4-C Hub worktree | 6 | 2 | 0 | 66.67% | Read-only calculation |
| Actual FINAL CHECK checkout | 6 | 2 | 0 | 66.67% | Read-only; existing shared adapters preserved |
| Actual DECODE checkout | 6 | 0 | 0 | 100% | Restricted pending project policy review; not a success score |
| New synthetic project | 6 | 1 | 1 | 83.33% | Exact canonical local fallback applied |

Fresh positive/negative sessions used the existing Claude subscription, native
selection, plan permission mode, and only Read/Skill tools. Prompts contain no
skill names. No custom router, account connection or Codex inference was used.
Normal Claude startup hooks/session bookkeeping ran; this is not an isolated
host-settings experiment. Raw logs remain local; bounded extracted evidence
with raw-file digests is tracked alongside the calculations.

Observed startup: 146 directory skills (145 user, 1 project), 130 plugin skills,
37 bundled skills; `getSkills` returned those categories and the attachment
reported 292 skills. That is not proof all 313 discovered entries retained
descriptions. Exact post-budget descriptions/omissions remain **UNVERIFIED**.
Actual roots: managed `C:/Program Files/ClaudeCode/.claude/skills` (absent),
user `.claude/skills`, synthetic project `.claude/skills`, enabled plugin paths.
The shared `.agents` root was not listed by this Claude startup trace.

Both fresh sessions reported this newer warning:

```text
Skill listing over budget: 292 skills, 107759 chars > 30000 budget — descriptions will be truncated. Run /skills to disable some, or raise skillListingBudgetFraction in settings.
```

These numbers are observed for this session/model only, not hardcoded policy.
`HOST_GLOBAL_BUDGET_CONFOUND` remains: one local candidate cannot establish
whole-host budget success. No global skills were removed to improve the result.
All six registry Hub names appeared in startup slash-command discovery; that
alone does not confirm all six descriptions were model-visible.

The positive prompt automatically called `Skill(ush-repo-evidence-plan)`.
The runtime-injected content reported **the global `.claude/skills` adapter
path**, not the synthetic canonical local path. This is direct automatic load
evidence for the global copy, and **GLOBAL_COPY_SELECTED** blocks the required
project-local exact-load claim. No precedence theory is substituted for the
observed path. The arithmetic negative case completed with no tool calls and
no Hub load. Neither model narrative nor the local file's existence upgrades
the positive case to project-local success.

### Regression matrix, metrics and completion gate

The tests cover all 18 requested cases: runtime/scope/requirements/policy
exclusions, unrestricted inclusion, operation-only permissions, unmanaged
preservation, duplicate IDs, small and oversized candidate sets, irrelevant
additions, long descriptions, input ordering, safe stale updates, modified
managed conflicts and confirmed-only removals. Additional cases cover canonical
integrity, extra user files, frontmatter budget accounting and lifecycle gates.
The first run failed on the missing module before implementation (RED).
Final local Windows `npm run verify`: **346 passed, 0 failed, 0 skipped**,
including 26 new scoping/reconciliation tests; 6 registry entries with zero
inconsistencies and 24 adapters with zero drift. This is local verification;
new-head hosted CI is a separate result. Existing Phase 1.3 routing fixtures,
canonical bodies, registry and adapter bytes have no diff.

Metrics: `hubSkillsTotal`, `projectCandidates`, `materializedHubSkills`,
`candidateReductionRatio`, `requirementsExcluded`, `policyExcluded`,
`runtimeExcluded`, `scopeExcluded`, `budgetExcluded`, `unmanagedPreserved`,
`visibilityConfirmed`, `visibilityUnknown`, `overflowObserved`. Unobserved
numeric values remain JSON `null`, never invented zeroes. Filesystem counts
refer to their stated root, not all runtime/global placements.

Decision 17 is **PARTIAL**, not a completion candidate. Synthetic scoping and
local placement have passed; fresh local exact-load, complete visibility,
historical-warning reproduction and host budget attribution remain blocked or
unverified. Native install/update/discovery evidence above remains separate from
the new fallback. Actual project-local ORCA placement parity must be evaluated
before claiming native end-to-end integration. Preserve canonical/hash/safety
layers, unmanaged files, positive and negative direct evidence, and fail-closed
operation gates as mandatory acceptance criteria.

Out of scope: custom LLM router, vectors/embeddings, cloud routing, third-party
marketplace cleanup, global skill deletion, lifecycle promotion, numeric
promotion thresholds, OpenCode installation, Codex paid/live routing reruns.
