# Prepare project Skills — Decision 18

Issue #9 now targets explicit one-time project preparation followed by native task-time selection. Universal automatic startup is not required. The [approved design](superpowers/specs/2026-09-12-project-skill-prepare-design.md) and [three-task plan](superpowers/plans/2026-09-12-project-skill-prepare.md) preserve the earlier history.

## First preparation

Use a trusted Hub checkout with its existing dependencies installed. Review the target project's rules and provide a JSON context using the existing scoper schema. Prepare only reads this file; it neither creates context nor infers tools, capabilities, permissions or policy from project prose.

For example, after verifying repository-read capability and policy permission, an operator may supply this deliberately narrow context (replace project identity/scope with the actual project):

```json
{
  "identity": "example-project",
  "project_scope": "example-project",
  "runtime": "codex",
  "policy": { "allowedSkillIds": ["ush-repo-evidence-plan"] },
  "availableInputs": ["repository"],
  "availableTools": ["git_diff_read"],
  "availableCapabilities": ["repository_evidence"],
  "grantedPermissions": []
}
```

This policy allowlist is an initial project configuration, not a task prompt. Later requests need no Skill ID. Never copy capability/permission claims without verifying them. Source-project policy remains authoritative, and unresolved policy must remain restrictive.

From the Hub checkout:

```text
npm run prepare-project -- --project-root <absolute-project-root> --context <absolute-context-json>
npm run prepare-project -- --project-root <absolute-project-root> --context <absolute-context-json> --apply
```

Or invoke `node <hub>/scripts/project-skill-prepare.mjs` with the same flags from another directory. Both paths must be absolute. The target must be an existing Git worktree root; nested/non-Git targets are rejected. Source files always come from the entrypoint's Hub checkout.

Runtime is the context's `runtime`, or `--runtime codex` / `--runtime claude-code` when absent. Supplying both requires agreement. No automatic detection or multi-runtime orchestration is performed. Run separately for each runtime when needed.

The CLI emits newline-delimited JSON: PREVIEW alone by default, PREVIEW followed by APPLIED for successful `--apply`. Each includes candidates, exclusions, actions/counts, metrics and receipt path. PREVIEW's receipt path is a destination, not a claim that the receipt already exists. npm additionally prints its normal command banner; direct Node invocation is suitable for machine parsing.

## Reconciliation and reruns

Only scoped candidates go to `.agents/skills` (Codex) or `.claude/skills` (Claude), with the existing platform `.ush-project-scope.json` ownership receipt. Same inputs leave Skill payload bytes unchanged; the receipt may be rewritten. Prepare does not read or modify global Skill roots, project instruction files or runtime settings.

Rerun after a trusted canonical update or changed project policy, runtime, requirements, available tools/capabilities or granted permissions. Ordinary tasks do not require Prepare. There is no automatic source update or background behavior.

Preview removal actions before explicitly rerunning with `--apply --confirm-removal`. This preserves the existing confirmation contract; no force/adopt option exists. Same-ID unmanaged files, edited managed files, invalid canonical bytes and pending journals fail closed. Resolve conflicts through the existing operator-reviewed process; do not delete files or receipts merely to bypass refusal. Supporting-file Skill trees remain unsupported by the existing materializer.

Preview is not a transaction token. Apply reloads context/registry and re-evaluates through the existing reconciler, lock and preimage journal. The journal does not promise power-loss durability or protection from hostile host processes. Startup eligibility does not grant task-specific merge/send/publish permission or replace L3/L4 gates.

Generic runtime overflow remains an observation, not a placement veto. Optional `maxCandidates` / `maxDescriptionBytes` are project allocations, not predictions of native runtime limits.

## Validation on 2026-09-13

Production entrypoint: 61 nonblank lines, plus one npm script. Core scoping, eligibility, reconciliation and legacy bootstrap code are unchanged. Task 1 RED was observed as 2 failures (`MODULE_NOT_FOUND`); the implementation made both pass. Task 2 added retained-behavior integration coverage without core fixes.

| Target | Runtime | Hub total / candidates | Applied | Re-run |
| --- | --- | --- | --- | --- |
| Hub branch checkout | Codex | 6 / 1 | No; read-only PREVIEW | Not needed |
| Existing FINAL CHECK checkout | Claude Code | 6 / 1 | No; read-only PREVIEW | Not needed |
| New synthetic Git repository | Codex | 6 / 1 | Exact canonical candidate + receipt | unchanged |
| Same synthetic Git repository | Claude Code | 6 / 1 | Exact canonical candidate + receipt | unchanged |

Contexts were explicitly authored for this validation with a repository-planning-only allowlist and no write permissions. These counts are for that declared policy, not a claim of exhaustive domain classification. FINAL CHECK's current AGENTS.md was inspected; its modified policy and unmanaged `.agents` deployment were preserved. The Claude preview did not adopt or modify that Codex deployment. Existing actual projects received no apply.

Fresh Codex positive prompt: “Inspect this repository and produce a bounded evidence-based implementation plan for adding total quantity to the inventory summary described in README.md. Cite the relevant files and distinguish observed facts from assumptions. Do not implement or modify files.”

Fresh negative prompt: “What is 17 + 25? Answer with the number only.”

Neither prompt contains a Skill ID. Positive command event `item_3` directly reads `<synthetic>/.agents/skills/ush-repo-evidence-plan/SKILL.md` with `Get-Content -Raw -LiteralPath`; its completed output contains the Skill body. The filesystem hash is `352228bb6f66153a09bdb7fa7f127080ba1401ead4f64994ddbcdb3cc07f6688`, matching canonical. The native prompt-input catalog also includes the local candidate. Negative returns `42`, with no command/tool events and no observed Hub load. Details and raw artifact digests are in the adjacent Decision 18 evidence summary; raw logs remain local under ignored `dist/decision18/`.

Both fresh sessions reported:

```text
Exceeded skills context budget. All skill descriptions were removed and 70 additional skills were not included in the model-visible skills list.
```

The local candidate remained visible and was read in the positive run. Overflow attribution remains `OVERFLOW_ATTRIBUTION_UNVERIFIED`; this is not a claim that host-global budget was fixed. Native body transport shows the prior punctuation loss; exact filesystem bytes and selected local path are confirmed separately from byte-for-byte model transport. No further runtime internals investigation was performed.

## Acceptance and limitations

| Requirement | Result / evidence |
| --- | --- |
| Explicit one-time entrypoint, candidates only | PASS: CLI integration and synthetic apply |
| Codex and Claude project-local placement | PASS: separate apply/reapply and canonical receipts |
| Idempotence, unmanaged preservation, modified conflict | PASS: wrapper regression tests |
| Canonical integrity, policy, removal confirmation | PASS: wrapper tests plus existing core suite |
| Native implicit local positive / negative no-load | PASS for the observed Codex cases; no universal routing claim |
| No added startup/background hooks or global cleanup | PASS: scoped source diff; native pre-existing session hooks remain host behavior |
| Platform release gate | Check exact delivered-head Windows/Ubuntu CI before delivery acceptance |

Focused wrapper: 11 passing tests. Wrapper plus scoping: 55 passing tests. Full verify passes; stored routing evaluators pass with their historical partial/unknown denominators unchanged. Do not reuse these stored metrics as new live results. The [evidence summary](decision18-prepare-evidence.json) separates placement, visibility, body reads and host observations. Codex ran version 0.154.0 with observed model `gpt-5.6-sol`, effort `high`, and read-only sandbox; the positive made five read/inspection commands and one confirmed Skill body read, the negative made zero commands.

A before/after-live-run inventory sampled 1,030 global Skill files. Ten paths in the third-party `product-design/0.1.54` plugin cache disappeared during this interval. No Prepare code or observed model command writes global Skill roots, but the external cause was not traced. Host-wide unchanged inventory is therefore NOT CONFIRMED. No cleanup, restoration or plugin reconfiguration was performed to hide this observation. This does not change candidate-only placement evidence.

Known limitations remain: WSL/remote, zero-click startup, host-enforced eligibility, host-global context budget, exact transport, Claude implicit/global precedence history, native safe-update parity, SKILL.md-only materialization and explicit context preparation. Local placement does not imply hot reload in an existing session. Use a fresh native session for validation. Issue #9 remains OPEN for review; this change does not merge or close it automatically.
