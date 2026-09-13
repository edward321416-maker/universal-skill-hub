# Decision 18 implementation plan

Status: user approved the [design](../specs/2026-09-12-project-skill-prepare-design.md) and execution on 2026-09-13. The original plan-review-only delivery remains in commit `aaf44b9`. See [implementation validation](../../project-skill-prepare.md).

Base: `d1f5eb39562e458f850e91b70724b716f912ce11`; branch `phase/project-skill-prepare`; Issue #9. No automatic issue closure or merge.

## Task 1 — Thin Prepare CLI: RED then minimal implementation

Files: new `scripts/project-skill-prepare.mjs`, new `scripts/__tests__/project-skill-prepare.test.mjs`, one script in `package.json`.

1. Inspect existing test fixtures and reusable exports. Add CLI behavior tests using temporary Git project roots and the trusted Hub source. Do not alter actual global/local installations.
2. RED: missing entrypoint must fail a preview/apply integration test. Preview must leave target untouched; apply must place only eligible canonical candidates and the existing receipt. Assert exact byte/hash equality, unrelated candidate absence and report mode/counts.
3. RED: invocation from a different CWD still uses module-relative Hub source and the explicit target. Reject absent/relative paths, non-root target, malformed context, unsupported/conflicting runtime and unknown flags before writes.
4. Run `node --test scripts/__tests__/project-skill-prepare.test.mjs` and capture actual pre-fix failures.
5. Implement only parsing, target/context loading, preview/result presentation and calls to `reconcileProject`. Reuse its internal `scopeProject` and safety machinery. Register `prepare-project` (never npm lifecycle `prepare`). Use argument-array Git calls; no shell interpolation or new dependencies.
6. Focused GREEN. If implementation needs hundreds of production lines, stop for design review rather than adding infrastructure.

## Task 2 — Re-run and safety contract integration

Files: same CLI test file; entrypoint changes only if a failing wrapper regression requires them. Existing core files remain unchanged by default.

1. RED tests before any necessary fix: repeat apply preserves Skill payloads; changed approved fixture source updates owned files; unmanaged same-ID and user-edited managed files fail without overwrite; unrelated unmanaged content survives.
2. Verify policy denial and candidate removal: preview reports removal, apply without confirmation fails, explicit confirmation removes only unchanged owned files. Invalid `--confirm-removal` use fails early.
3. Verify both Codex and Claude roots/receipts independently, and runtime mismatch rejection. Neither path changes project instruction files or global roots.
4. Verify overflow observation remains true while placement succeeds; both deterministic allocation limits still exclude candidates. Reuse existing core safety regressions rather than duplicating every transaction implementation detail. Add entrypoint tests for canonical failure and pending-journal propagation; assert no relaxed retry or cleanup.
5. Execute focused CLI plus existing scoping regressions: `node --test scripts/__tests__/project-skill-prepare.test.mjs scripts/__tests__/project-scoping.test.mjs`. Label already-covered behavior as retained coverage; do not invent a RED failure for functionality already passing through existing code. Only actual wrapper defects receive minimal fixes.

## Task 3 — Project validation, native evidence and documentation

Expected files: `README.md` usage link/command and a bounded `docs/project-skill-prepare.md` usage/acceptance report. Keep raw runtime artifacts local/redacted; add a small evidence summary only if necessary for review. Preserve all Phase 1.3 raw evidence and Decision 17 historical records.

1. Preview the Hub and one existing real project (prefer FINAL CHECK if its current target/policy is confirmed). Read actual project policy before deriving context. Do not use an old path or permission claim as current authority. If unavailable, report BLOCKED rather than substitute a fixture silently. DECODE restrictions are not bypassed.
2. Apply/reapply Codex and Claude in an explicitly isolated synthetic Git project; record exact candidates, canonical bytes and receipt results. For actual repositories, apply only after explicit target approval; read-only preview already evaluates their contexts. Label these categories separately.
3. After preparation, validate one positive repository-planning request and one negative arithmetic/general request in a fresh native Codex session on the approved fixture. Prompts contain no Skill ID. Collect catalog visibility and direct SKILL.md read path/tool evidence; narrative alone is insufficient. Capture mutations/tool calls and any unexpected loads. Missing load proof is UNCONFIRMED, not fabricated failure/success. Retain Claude global-precedence limitation unless separately tested; do not silently expand live-runtime scope.
4. Document first-time context preparation, preview/apply/removal examples, re-run reasons, ownership conflict resolution boundaries and all known limitations. No force-cleanup instructions or automatic policy parsing claims. Distinguish PREPARED from MODEL_VISIBLE/SELECTED/LOADED and preserve overflow attribution uncertainty.
5. Run `npm run verify`, `npm run routing-eval`, `npm run routing-eval:cursor`, `git diff --check`, and `git status --short`. Check diff against baseline for unchanged canonical bodies, registry, adapters and Phase 1.3 evidence. Do not overwrite stored routing fixtures with new live results.
6. On authorized delivery, commit/push only scoped implementation/test/docs changes; verify Windows and Ubuntu CI on the exact delivered HEAD. Report Issue #9 acceptance item by item and propose closure only when the design's closure definition is satisfied. Do not merge or close automatically.

## Scope and stop conditions

No daemon, router, installer replacement, legacy cleanup, global hooks, metadata framework, credential access or runtime internals research. If an existing core defect is discovered, capture evidence and report the smallest separately reviewable fix; do not turn this wrapper task into a core refactor. Implementation and the bounded live validation were separately authorized after the original design-only session.
