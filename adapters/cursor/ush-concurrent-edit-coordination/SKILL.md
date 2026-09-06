<!--
GENERATED — DO NOT EDIT
Rendered from canonical skill "ush-concurrent-edit-coordination" for platform "cursor".
canonical_content_sha256: a8b83254c1eaffb35c15222ec1bb5227f0c00725111ea44a76e364f1bb2d3728
source_commit: 4b8cf8b0faa7e1d7dc195984dcb66fc468b3157f
Edit the canonical SKILL.md under skills/ and re-run scripts/render-adapters.mjs instead.
-->

---
name: ush-concurrent-edit-coordination
description: Determine whether two currently-active pieces of work actually overlap on the same implementation source — the same checkout, the same file hunks, or the same public contract — before treating them as needing coordination. Use when asked to check collision risk between two agents or workstreams actively editing code, or when a task-flow skill needs to decide whether to pause for another in-flight change. Do not use to compare plans, backlogs, or open issues/PRs alone, and do not use to reach out to work that has already finished.
metadata:
  scope: global
  risk: L0
  status: EXPERIMENTAL
  version: 1.0.0
  source_repo: https://github.com/openbaeseongjin/baeseongjin
  source_path: .codex/skills/coordinate-github-tasks/SKILL.md
  source_commit: 4b8cf8b0faa7e1d7dc195984dcb66fc468b3157f
---

# Concurrent Edit Coordination

Coordinate only when two pieces of work are genuinely, currently touching the same implementation boundary. This is a generalization of a project-specific skill for coordinating between simultaneous AI coding sessions; it keeps the overlap classification and the refusal to guess, and drops the assumption that the caller runs inside a specific chat/task-list tool.

## When to use / when not

Use this before or during implementation when there's a real question of whether another actively-being-edited change could collide with this one — e.g. "two agents are editing the same API contract, check collision risk," or a github-task-flow-style skill deciding whether a merge needs to wait on something else.

Do not use this to compare project plans, backlogs, or a list of open issues/PRs — those are not evidence of an actual source conflict. Do not use it to re-engage work that has already finished (merged, closed, or reported complete) — read its result as history, don't reopen the conversation that produced it.

## Entry gate

Only proceed to coordinate when **all** of the following hold, based on actual inspectable evidence (`git status`, `git diff --name-only`, `git diff --cached --name-only`, or an equivalent real diff per workstream) — not on inference from titles, plans, or scheduling:

1. This work is actively editing implementation source that changes runtime/build/test behavior.
2. The other workstream is also actively editing implementation source right now (not planning, not reviewing, not finished).
3. There is concrete evidence the two diffs would collide — same checkout, same file hunk, or the same public contract (schema, API, shared fixture, generated index).

None of the following count as entry evidence on their own: a shared repository, an open issue or PR, a similar feature area, a plan or backlog item, or documentation-only overlap. If the evidence needed to classify overlap isn't actually available — no visibility into the other workstream's real diff — **SKIP**; do not guess at a conflict that can't be verified.

## Overlap classification

Evidence priority: **actual hunk/diff > public contract change > shared checkout > explicit statement from the user.**

| Result | Condition | Action |
|---|---|---|
| `none` | Changed paths and contracts are disjoint | No coordination needed |
| `shared-checkout` | Both workstreams share the same working tree/stage | One owns the write; the other moves to an isolated checkout or waits |
| `hunk` | Same file, same symbol/region edited by both | Assign a single owner for that hunk |
| `contract` | Both change a shared schema, public API, fixture, or generated index | Assign a contract owner and state what the other side needs from it |
| `duplicate` | Both are already implementing the same outcome | Prefer the workstream the user already designated as primary; stop the duplicate |

The same file touched in genuinely disjoint hunks and contracts is still `none`. Concurrent edits to planning or handoff documents only count if they accompany an actual implementation-source collision — a plan-doc edit alone is not a conflict.

## Safety Contract

- Never guess an overlap from plans, titles, or scheduling metadata. If real diff evidence isn't available, SKIP.
- Never re-engage, interrupt, or reassign work that has already finished — treat its merged code, commit, or PR as read-only evidence.
- Do not redistribute a plan the user has already split between workstreams. Coordination decides ownership of an overlapping *edit*, not who does *which feature*.
- Do not modify another workstream's checkout, branch, staged changes, or commits on its behalf.
- This is a read-only classification skill by default: it does not itself perform a git write. Any resulting write (e.g., pausing a merge, reassigning a hunk) is carried out by the caller, not by this skill invoking an external mutation.

## Result Contract

- `status`: `completed` or `needs_approval`
- `overlap`: `none`, `shared-checkout`, `hunk`, `contract`, or `duplicate`
- `evidence`: the actual diffs/paths inspected to reach the classification
- `owner` / `dependent`: which workstream proceeds and which waits, when overlap is not `none`
- `risks`: evidence gaps that made the classification uncertain
