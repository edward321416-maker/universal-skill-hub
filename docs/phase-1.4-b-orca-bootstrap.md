# Phase 1.4-B: ORCA bootstrap — experimental integration

Status: partial implementation; not a production-ready universal startup hook.
Tracks issue #9. This branch is stacked on the unmerged Phase 1.4-A revision
`463446ae2372161dd9431c96bcb52bdfab024001`; PR #8 must be reviewed independently.
No merge is authorized. Canonical skills, registry hashes, lifecycle and Phase 1.3
routing evidence are unchanged.

## Implemented boundary

- `orca-seal-release.mjs` checks exact Git HEAD, approved origin and tracked
  cleanliness before writing a new, exclusive manifest. The operator must first
  run full verification. It is not invoked by startup to repair failed integrity.
- `orca-bootstrap.mjs` rehashes the approved cache, checks canonical hashes,
  rejects redirected paths and mismatching existing skills, reviews existing
  policy by exact hash, and serializes cooperating preparations. It invokes the
  existing installer against the actual destination in dry-run mode and uses the
  same installer in a unique staging directory before verified per-skill moves.
- `orca-launcher.mjs prepare <absolute-config.json>` queries the live ORCA
  repository/worktree inventory, requires an explicitly enrolled repository or
  configured approved remote owner, and deploys into the exact registered CWD.
  No environment variable alone authorizes a target. No latest-branch download,
  background synchronization or global PATH/policy modification occurs.
- `gate <absolute-config.json>` consumes task JSON on stdin and calls the existing
  `evaluateEligibility`. Unknown task facts are not filled with synthetic grants.
  A BLOCK returns exit 2. This bridge is **ADVISORY**, not a host tool interceptor.
- `run <absolute-config.json> <native argv...>` is an experimental native process
  wrapper. Only a standalone help/version request bypasses preparation. Interactive
  Windows Ctrl+C, resume/fork and host-enforced start suppression are NOT VERIFIED;
  do not activate it as a universal agent command until those contracts pass.

The trusted config is host-local, outside project source. It contains version 1,
pin, absolute ORCA executable, release-manifest path, receipt directory,
allowedRepoIds/allowedOwners, and reviewed policy hashes keyed by exact target or
repository ID. `nativeExecutable` is needed only for experimental `run` mode.
Do not expose personal paths, repository inventories or account IDs in this PR.

## Observed ORCA integration limitation

On the inspected ORCA 1.4.198 installation, the installed runtime client exposes
`settings.get` with `agentCmdOverrides`, but `settings.update`'s strict parameter
schema excludes that key. Its presence in Settings or in a read response does not
establish an automated write interface. The user prohibited UI interaction; no
database edits, renderer injection, application patch or global executable shim
was used to bypass this limitation.

The installed runtime does accept `repo.update` with `hookSettings`. A local,
explicitly registered synthetic Git project was configured using that endpoint
and read back. Its first setup command failed because a shell separator became
part of an argument. A dedicated PowerShell `-File` entrypoint corrected that;
a subsequent new worktree automatically ran setup and installed all six exact
Codex adapters. This is **setup execution**, not proof of agent startup ordering
or automatic enrollment of arbitrary future projects. Existing production setup
commands were not replaced. The test resources and failed attempt are retained.

## Verification and evidence limits

Initial restored tests: 9 pass / 2 fail, demonstrating inconsistent-host acceptance
and an argv-triggered preparation bypass. Both corrected; focused suite expanded
to 13 deterministic filesystem/process/engine tests. An additional test initially
assumed the L0 planning registry entry had required capabilities; that assumption
was corrected to use the L3 entry that actually declares them, without changing
the engine or registry. Synthetic grants in tests are not observed task grants.

The pinned source passed full verification on the Windows deployment host. Both
stored routing evaluators were rerun without tracked evidence changes. Integration
CI results must be read at the actual PR head; prior Phase 1.4-A CI is not evidence
for this new code. Local WSL has no native Node on the inspected PATH; Windows npm
discovery is not treated as a Linux installation.

Local receipts distinguish installation, exact adapter equality, quota-free native
catalog visibility, successful installed-body loading, and actual automatic
selection. No new paid/inference probes were made. A visible catalog is not a
successful SKILL.md load or routing reliability claim. Policies instruct agents
to load only relevant selected bodies, respect project locks, and preserve
EXPERIMENTAL L3 and merge/send/publish gates.

## Remaining release gates

- Supported no-UI agent command binding for existing sessions and future projects.
- Actual setup failure suppressing agent start, and two different existing-project
  agent-start E2Es; synthetic project auto-enrollment without manual configuration.
- Native interactive TTY/stdio/signals/resume/fork tests on each supported host.
- Compatible thin-router integration for DECODE; do not append conflicting policy.
- Complete settings/policy audit, unknown manifest formats, and full preimage-based
  rollback tests. Local audit uses UNASSESSED rather than fabricated success.
- Source and tool-cache trust assumes an operator-controlled local directory;
  this is not protection against a malicious process with the same OS identity.
- Atomicity is per file/skill directory under a cooperating lock, not a global
  transaction across all six skills. A failed preparation is not ready; partially
  materialized files may remain and must be inspected before retry or rollback.
- No automatic rollback deletes files or overwrites subsequent user edits. Restore
  settings only from the exact retained preimage after checking current state;
  remove test resources only with exact-target approval. Keep active sessions.

Do not claim all-project automatic connection complete while these gates remain.
