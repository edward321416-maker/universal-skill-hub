# Phase 1.4-C: native ORCA skills integration

Status: partial. Tracks issue #11; issue #9 stays open because Phase 1.4-B is
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

- Fresh Codex implicit-selection runs, deferred while Codex quota is exhausted.
- Two existing-project native E2Es; one is blocked by a project lock.
- Migration from already-deployed adapter state to canonical native state.
- The 312-row settings audit re-run against 1.4.200.
- `~/.claude` global inspection under the symlink guard.
- In-agent ORCA bridge access from the Codex sandbox, unchanged from 1.4-B.
