# Decision 18: Explicit project Skill Prepare

Status: proposed interface and implementation plan, pending user review. The one-time preparation direction is approved; production implementation is not authorized yet.

Baseline: main `d1f5eb39562e458f850e91b70724b716f912ce11`. Related: Issue #9; Decision 17 in [Phase 1.4-C](../../phase-1.4-c-native-orca-skills.md), completed with known limitations. This decision supersedes Issue #9's universal automatic startup completion target without deleting its history.

## 1. Goal

Provide one explicit project preparation command. Materialize only eligible canonical candidates using the existing scoper and reconciler. Subsequent normal requests use native discovery and semantic selection without requiring Skill IDs in prompts. Preparation reports filesystem results; it does not claim that installation proves visibility, loading, selection, or enforcement.

## 2. Non-goals

No startup hooks, daemon, watcher, service, background synchronization, automatic project interception, sandbox bridge, router, classifier, package manager, global manager, account manager, runtime patch, token estimator, description optimizer, or third-party cleanup. No WSL/remote expansion, lifecycle changes, canonical edits, or legacy deletion. No runtime inference calls inside Prepare.

## 3. User flow

```text
Explicit project Prepare (first use; rerun when inputs change)
  -> validate target/runtime/operator-supplied project context
  -> existing reconcileProject -> scopeProject -> verified candidates
  -> preview candidate IDs, exclusions and create/update/remove actions
  -> explicit apply -> native local convention + existing receipt
  -> preparation summary

Later normal request -> native discovery -> native semantic selection
                     -> native task-time SKILL.md load and execution
```

Preview is read-only. An invocation with `--apply` prints the preview before applying. It is explicit authorization for safe managed placement, not permission for task-time merge/send/publish. Changes between preview and apply are re-evaluated by the reconciler; preview is not a frozen approval token. Removal additionally requires `--confirm-removal`.

## 4. Existing components reused

| Component | Reuse / responsibility |
| --- | --- |
| `scripts/project-scoping.mjs:reconcileProject` | Preview and apply, canonical metadata/hash verification, candidate calculation, native local placement and ownership receipt |
| `scopeProject` in the same module | Deterministic eligibility and optional project allocation; invoked through reconciliation, not duplicated in the wrapper |
| `scripts/eligibility.mjs` and `registry/conflicts.json` | Existing startup eligibility and task-operation distinction |
| `scripts/scoping-transaction.mjs` | Lock-protected checks, preimage journal, conditional rollback; unchanged |
| `scripts/orca-bootstrap.mjs:safePath,digest` | Existing safety dependencies of reconciliation; unchanged |
| `registry/skills-index.json` and canonical Skill library | Source and provenance; no separate cache, registry or receipt format |
| Native Codex / Claude / ORCA | Discovery, model-visible listing, semantic selection, loading and execution |

The repository already uses explicit kebab-case npm script names and standalone Node ESM CLIs. Choose `prepare-project`, not the npm `prepare` lifecycle hook. Calling the existing scoping CLI alone was rejected because it only prints scope; calling the legacy installer was rejected because it does not provide this candidate-only reconciliation flow.

## 5. Prepare interface

Proposed new production file: `scripts/project-skill-prepare.mjs`, exposed as `npm run prepare-project -- ...`.

```text
node <hub-checkout>/scripts/project-skill-prepare.mjs \
  --project-root <absolute-project-root> --context <absolute-context-json>

# Add --apply to prepare; add --confirm-removal only for reviewed removals.
# Optional --runtime codex or --runtime claude-code if context lacks runtime.
```

Both paths are required and absolute, avoiding npm working-directory ambiguity. Verify the target is an existing Git worktree root, including linked worktrees, using argument-array Git invocation with no shell interpolation. Reject a subdirectory rather than silently widening the target. Synthetic validation uses a temporary Git repository. Non-Git projects are outside this initial interface.

Derive Hub sourceRoot from the entrypoint's module location, never from target CWD. Read registry and conflicts there. No fetch, install, update, enrollment, or remote lookup is performed by Prepare. The operator supplies a trusted Hub checkout with dependencies already available.

Reject unknown/duplicate flags, absent values, unsupported runtime and malformed context before writes. `--confirm-removal` without `--apply` is an input error. Use existing error codes where available and a nonzero exit for failures; no force/adopt/skip-integrity options.

Output a preview and final result with target, source, runtime, candidate IDs, exclusion reasons, action counts, existing scoping metrics and receipt location. Label PREVIEW versus APPLIED explicitly. Do not dump Skill bodies or arbitrary context content. Preserve `overflowObserved` including null; leave visibility/load fields unknown unless backed by separate runtime evidence. Zero candidates is a valid reported result, not a successful automatic-use claim.

## 6. Runtime selection

Use the existing context's `runtime`, or explicit `--runtime` if it is absent. If both exist they must agree. Support only `codex` and `claude-code`. No reliable automatic signal is established for this wrapper, so do not infer runtime from installed executables, global folders or ORCA provider guesses.

Codex placement is `<project>/.agents/skills`; Claude placement is `<project>/.claude/skills`. Preparing both, if needed, is two explicit invocations with separate runtime contexts. No multi-runtime orchestration or cross-runtime atomicity is promised.

## 7. Project context

Reuse the existing `scopeProject` JSON input: `identity`, `project_scope`, `runtime`, `policy`, `availableInputs`, `availableTools`, `availableCapabilities`, `grantedPermissions`, and optional `budgetSignal`. Keep identity stable for receipt matching. Do not introduce a new project metadata schema or persist a second context database.

The operator reviews applicable project rules and supplies the existing structured policy. Markdown policies are not automatically translated into JSON. `policies/projects/README.md` preserves source-project authority; an empty central directory is not evidence of unrestricted permission. An unresolved policy review must produce an explicitly restrictive context, not inferred access. Observed tools and granted capabilities/permissions are distinct; having Git installed does not grant writes or prove every capability.

Do not populate startup requested operations, selected skills, or resource approvals from a future task. Existing operation gates remain task-time decisions. Preparation does not enforce host behavior. Context creation and review are part of the permitted initial setup burden, not a new automatic classifier.

## 8. Reconciliation semantics

Delegate preview and apply to `reconcileProject` using the same source/target inputs; do not independently copy files or write receipts. The reconciler already calls `scopeProject` and accounts from verified canonical descriptions. Reload input files for apply so stale preview objects do not authorize placement.

Preserve the existing platform receipt `.agents/.ush-project-scope.json` or `.claude/.ush-project-scope.json`. Same-ID unmanaged content is a conflict even when identical. Edited managed content and additional supporting files fail closed. No-longer-eligible managed candidates require the existing `confirmRemoval` contract. Pending journals require existing recovery handling; the wrapper must not erase them or retry with relaxed checks.

## 9. Safety

Preserve exact canonical bytes, hashes, receipts, unmanaged files, project instructions and policy authority. No AGENTS.md/CLAUDE.md injection. Use existing path/symlink checks and cooperating-writer locking; do not claim a hostile-host security boundary or power-loss durability. External write, L3/L4 and exact-content approval gates remain unchanged.

Generic host/runtime overflow observation is evidence, not sufficient cause to block Hub project-local materialization. Existing `maxCandidates` and `maxDescriptionBytes` remain optional deterministic project allocations, not runtime token limits. Whole-library copies, description shortening and global cleanup are forbidden.

## 10. Re-run/update behavior

Unchanged inputs produce unchanged Skill payloads and unchanged candidate membership. The existing receipt may be rewritten: idempotence does not promise zero filesystem writes or preserved receipt mtime. A trusted Hub update permits only existing safe managed updates. Rerun after canonical updates, project policy/runtime changes, or changed inputs/tools/capabilities/permissions affecting candidates. No Prepare is needed for each ordinary task.

## 11. Acceptance criteria

Implementation must demonstrate: explicit entrypoint; candidate-only placement; Codex local placement; Claude local placement with runtime-selection limits separately stated; repeat-run payload idempotence; unmanaged preservation; modified-managed conflict; canonical integrity; policy preservation; confirmed-removal behavior; implicit native positive selection with direct local-path evidence; negative no-unnecessary-load; no background hooks; no global cleanup.

Use a traceable acceptance table in the implementation report. Cover Hub, one real existing project and one synthetic project. Preview actual repositories read-only; apply only to explicitly approved targets or isolated fixtures. A fixture derived from real metadata is labeled a fixture, never an actual-project deployment.

Record target/runtime, Hub total, candidates, materialized files, receipt/hash checks, visibility, selected IDs, loaded paths and evidence source. Keep unknown values null/UNVERIFIED. Historical Decision 17 controls may support existing native behavior only when labeled historical, not a current Prepare result. Plan one fresh Codex positive and negative pair after fixture Prepare to connect the new entrypoint to native behavior; no Skill IDs in prompts. Obtain needed live-run/target authorization at implementation time if not already granted. Do not turn Codex evidence into Claude confirmation.

## 12. Known limitations

WSL, remote, universal startup, host-enforced eligibility, runtime internal budget attribution, Claude global precedence history, exact model transport and native safe-update parity remain limitations. Host-global overflow remains unresolved; attribution can remain `OVERFLOW_ATTRIBUTION_UNVERIFIED`. Native task selection is semantic, not a guarantee that every positive request loads a Skill.

Existing materialization supports SKILL.md-only candidates and refuses supporting-file trees. Existing unmanaged same-ID deployments require operator resolution outside Prepare; no automatic adoption or cleanup is added. Non-Git roots and automatic conversion of project policy prose are not supported by this initial interface.

## 13. Issue #9 closure definition

Supersede `universal automatic startup/bootstrap` with `explicit one-time project preparation + native automatic task-time selection`. Close only after reviewed implementation, required safety/behavior validation, Windows/Ubuntu CI, and separately attributed native evidence. All MUST items must pass or use the explicitly allowed Claude validation limitation. Known runtime limitations remain named, never relabeled PASS.

Design delivery alone does not close Issue #9. The issue stays OPEN during plan review. If Hub-controlled defects remain, report PARTIAL; if required behavior passes and only named native/platform limitations remain, recommend COMPLETE_WITH_KNOWN_LIMITATIONS as a closure candidate.

## 14. Future simplification

| Legacy area | Disposition |
| --- | --- |
| Bootstrap safePath/digest dependencies | REUSED; do not extract helpers solely for this task |
| Legacy bootstrap deployment/enrollment | FALLBACK_ONLY; not the Prepare production path |
| Launcher | FALLBACK_ONLY; automatic startup requirement OBSOLETED_BY_DECISION_18 |
| Sealing | FALLBACK_ONLY for the legacy pinned-release workflow; Prepare uses existing canonical verification |
| ORCA registration/sandbox bridge prerequisite | OBSOLETED_BY_DECISION_18 as a closure requirement; retained bridge code FALLBACK_ONLY |
| Removing legacy coupling/dead callers | FUTURE_SIMPLIFICATION after separate caller, parity and rollback review |

Expected new production code: approximately 60–100 nonblank lines plus one npm script, an estimate rather than a correctness target. If it grows into hundreds, stop and revisit the design. No new production dependency is expected.

### Design self-review

Reviewed against the existing main exports and CLI conventions: no duplicated scoper, description hydration, receipt writer, transaction engine or router is needed. Explicit source/target separation avoids npm CWD mistakes. Policy review remains an operator responsibility, not fabricated permissions. No-op semantics do not overpromise receipt stability. Runtime evidence remains separate from placement. The trade-off is an explicit initial context file and command instead of zero-click setup. Interface and plan await user review before implementation.
