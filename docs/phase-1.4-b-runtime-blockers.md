# Runtime follow-up: exact text delivery and ORCA access boundary

Issue #9 / Draft PR #10; still stacked on unmerged PR #8 at
`463446ae2372161dd9431c96bcb52bdfab024001`. This is not universal startup completion.

## Bridge: cause confirmed, access remains blocked

The same diagnostic ran on the host and through Codex 0.153.4's official
`command/exec` with `sandboxPolicy: readOnly`. The host can stat the configured
native ORCA executable and execute both inventory commands. In the sandbox the
CWD exists, but executable stat returns EPERM and spawn returns ENOENT (-4058).
No ORCA process is created; neither runtime handshake nor inventory JSON nor
eligibility evaluation occurs. The failure is not missing task permission.

A fresh model-triggered tool invocation independently confirmed Windows PowerShell
5.1 / ConstrainedLanguage, executable preflight EPERM, and `engineEntered:false`.
The requested-command metadata named PowerShell 7, while the executing shell
reported 5.1; metadata alone was not used as actual-shell evidence.

The minimum change is precise fail-closed diagnosis, not permission relaxation:
stat preserves EPERM (unlike existsSync); stderr is a separate JSON diagnostic
with stage, inventory command, errno/syscall/status and engine-entry flag. It
omits raw child stderr/private inventory. stdout remains reserved for decisions.
Inventory, enrollment, host checks and the existing engine are unchanged.

**In-agent bridge success is not claimed.** A supported sandbox-compatible ORCA
access path is still required. No directory grant, unrestricted helper, offline
authority snapshot, credential copy, PATH change or sandbox bypass was introduced.
Access to the executable and later runtime connectivity would both need validation;
changing one permission must not be assumed to prove the rest of the chain.

## Body: read and output boundaries corrected by a scoped reader

Raw canonical/adapter/installed hashes remain unchanged. The prior default
Windows PowerShell 5.1 read loses em dashes on the BOM-less UTF-8 input. Explicit
UTF-8 fixes the in-process string, but sandbox output still loses it: the observed
console encoding is ks_c_5601-1987, pipeline encoding us-ascii, and attempts to
set Console.OutputEncoding are rejected in ConstrainedLanguage. Those restrictions
were not changed. Host PowerShell 7.6.6 reads correctly; its Store executable was
not accessible through the inspected sandbox path. Host success is not substituted.

`scripts/read-skill-utf8.mjs <skill-id>` reads only the selected current-project
`.agents/skills/ush-*/SKILL.md`, rejects path escape/symlinks and invalid UTF-8, and
emits ASCII JSON containing the exact decoded content and raw-byte SHA-256.
Non-ASCII characters are JSON-escaped, not replaced; parsing restores the same
Unicode text. BOM and newline bytes are not rewritten or normalized. This is a
read-only transport, not an eligibility bypass or a skill-use permission grant.

The reader passed through both official sandbox command/exec and its PowerShell
native output path. A fresh, explicit model diagnostic then executed one tool
command: the recovered command output contains all 3,305 characters exactly and
the matching raw hash; the model identified U+2014. The same command reports
the bridge preflight block. This proves explicit body delivery, not an implicit
selection reliability metric or a complete skill workflow.

The helper is installed in host-local tooling. Existing managed project policies
were preserved, not rewritten to force every future agent to use it. Legacy plain
Get-Content remains unsafe in this environment; callers must use the reader and
parse its JSON content. Broad automatic adoption is NOT established.

## Shell construction and tests

JSON encoding is not shell quoting. New fixed-path bridge commands use literal
shell quoting. Exact old managed blocks remain accepted without modifying their
bytes. A real PowerShell / POSIX-shell fixture covers spaces, Korean, apostrophes,
backslashes, dollars and backticks. Windows double quotes are invalid path
characters and are explicitly rejected rather than silently lost by PS5 native
argv handling. Arbitrary task text is never shell-interpolated.

RED: actual gate CLI suite initially passed one case and failed six diagnostic
cases. GREEN: executable absence, malformed inventory JSON, partial inventory,
missing repo/worktree, host mismatch and existing engine decisions are covered.
Missing caller CWD is tested as a failure before CLI creation. The fake ORCA
executable is Node running fixture response scripts, not a real-host claim.
Existing missing-capability and EXPERIMENTAL L3 automatic-write BLOCKs are retained.

Reader RED preceded implementation. Unicode/backslash/newline/JSON-envelope and
invalid-input tests pass; Windows adds actual PowerShell output coverage, explicitly
skipped on Ubuntu. Live sandbox and model observations are separate from CI fixtures.

## Unchanged boundaries

The two existing-project starts were designated launcher tests, not cross-project
automatic wiring. New synthetic-project trust remains unapproved; no automatic
keystrokes, trust-store edits or global grants. Native ORCA Windows setup ordering
still depends on a prohibited process-policy relaxation and remains unverified.
No UI/DB/app edits, session termination, merge or DECODE policy change occurred.

The audit denominator remains 312. Non-UNASSESSED outcomes include blocked,
unsupported and not-needed entries; they are not all PASS. Historical 275 tests /
8 paths and 285 tests / 7 paths are dated prior snapshots, not current CI claims.
