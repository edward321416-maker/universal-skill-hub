# Phase 1.4-B follow-up — partial, not production complete

This supplements the initial rollout receipt. Issue #9 / Draft PR #10 remain
stacked on unmerged PR #8, source pin
`463446ae2372161dd9431c96bcb52bdfab024001`. No merge or canonical change.

## Corrections and contract tests

- RED: preparation returning undefined, null, an empty object or `ready:false`
  could start the child. The launcher now requires `ready === true`.
- RED: spelling the same Windows config path with forward slashes rejected an
  existing managed policy. Canonicalize the config path used to build commands;
  accept only operator-derived exact legacy blocks for the same config. Existing
  policy bytes, source hashes and adapters are never normalized or rewritten.
- RED: recursive invocation was not rejected. A child-scoped environment marker
  now rejects nested launcher entry. It does not mutate global environment.
- Synthetic native Node child tests cover Unicode/spaces/quotes/metacharacters,
  stdin, stdout JSONL, stderr and exit 7, and preparation rejection before input
  delivery. Literal `resume`/`fork` argv are not actual Codex resume/fork tests.
- A user edit while waiting on the preparation lock is preserved. A synthetic
  exact-preimage policy recovery procedure restores original bytes and refuses
  a later edit; it is not production multi-file/settings rollback automation.

## Actual host observations

The installed official ORCA 1.4.198 guide and source were inspected. Its Windows
`wait-for-setup` startup wrapper explicitly sets Process ExecutionPolicy Bypass.
That path was not executed under the no-policy-bypass constraint. Direct launcher
startup evidence must not be substituted for native setup-to-agent sequencing.

An initial direct-launch policy conflict exited 1 before Codex. After correction,
two distinct existing business projects reached native Codex 0.153.4 TUI after
`ready:true, changed:0`. A newly registered synthetic project's worktree reached
the directory trust prompt, not a ready task session. No trust setting was changed.
These were explicitly configured test launches, not universal automatic binding.

Two fresh, read-only task prompts used the existing account. The positive prompt
did not name a skill: a repository-evidence candidate was selected, but its
in-agent bridge invocation failed to spawn ORCA with ENOENT. The neutral task
returned 4 without displayed tool calls. Neither is a reliability score or a
change to Phase 1.3. The exact fresh-session call/output was recovered: 55 of 58
nonempty installed body lines matched; three em-dash lines differed in terminal
decoding. Faithful full-body loading is therefore not marked confirmed. This
text comparison does not normalize any bytes before integrity hashing.
The host also reported an unrelated invalid third-party
skill and skills-context truncation; neither third-party configuration was edited.

The eligibility bridge remains ADVISORY. Root-host invocation and a sandboxed
agent invocation are different execution environments. ENOENT is observed; its
precise underlying permission/path cause is not proven. No bypass was attempted.
No evidence establishes host interception of every merge/send/publish operation.

## Authority and scope

The original expanded instructions conditionally permitted official UI. A later
direct user message explicitly prohibited screen switching and Settings clicking.
That later message, not the original specification, is the basis for no UI use.
The strict supported settings.update schema still omits agentCmdOverrides.
Other independent inspection and tests continued. No private state-store writes,
renderer injection, global PATH shim, account switch or session termination.

A project disappeared from live registration during testing. Its remaining files
were retained; it was not silently re-enrolled. Path counts must be refreshed and
must not be presented as counts of distinct projects.

## Thin-router integration proposal — not applied

The deferred project's locked D021 requires AGENTS.md and CLAUDE.md to be thin
routers into the common operating manual, not separate policy copies. Its
AI_OPERATING_POLICY Activation and authority already points Codex to a supplemental
policy. Appending the current 25-line Hub block duplicates operating policy.

Minimal proposed change: after that project's approval, place deployment-only
candidate/load/bridge details in a local sidecar, then add a single link from the
existing Codex supplemental extension point. Keep the manual, locked decisions,
existing automatic skill rules, original router bytes and host permissions intact.
Do not approve a new prefix hash as a way of erasing the conflict. The sidecar
integration and installer support for that policy target are not implemented.

## Still open

Universal launch binding and unreviewed new-project enrollment; native setup
success/failure ordering; new-project trust; actual Ctrl+C/resume/fork/remote and
Claude contracts; an operator rollback entrypoint; unexposed live settings and
full audit. The synthetic in-test recovery closure above is superseded by the
`rollback` implementation described in `docs/phase-1.4-b-orca-bootstrap.md`.
Byte-mismatched managed files still fail CONFLICT: automatic updates are unsupported.
Local sanitized receipts, not private inventory or account data, accompany delivery.
