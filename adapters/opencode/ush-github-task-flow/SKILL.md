<!--
GENERATED — DO NOT EDIT
Rendered from canonical skill "ush-github-task-flow" for platform "opencode".
canonical_content_sha256: d781c4d4c3a4ab78e83976a4ed07c76c4375284542760aafd31ce89a5d89a9f4
source_commit: 4b8cf8b0faa7e1d7dc195984dcb66fc468b3157f
Edit the canonical SKILL.md under skills/ and re-run scripts/render-adapters.mjs instead.
-->

---
name: ush-github-task-flow
description: Carry a bounded implementation task through a GitHub issue, an isolated branch, validated changes, and an open pull request, using GitHub as the source-of-truth history for the work. By default this delivers an open, validated PR — it does not merge unless merging is separately and explicitly requested. Use when asked to implement an issue and open a PR, carry a repository task through branch/test/PR, or prepare a safe GitHub task workflow for existing work. Do not use for pure git-concept questions ("what is git rebase?"), for inspecting a commit without changing anything, or for reviewing a PR without also being asked to change it.
metadata:
  scope: global
  risk: L3
  status: EXPERIMENTAL
  version: 1.1.0
  source_repo: https://github.com/openbaeseongjin/baeseongjin
  source_path: .codex/skills/github-task-flow/SKILL.md
  source_commit: 4b8cf8b0faa7e1d7dc195984dcb66fc468b3157f
---

# GitHub Task Flow

Use a GitHub issue as the record of what is being done and deliver it through a pull request. This is a generalization of a project-specific skill: it keeps the safety-critical sequencing and force-push discipline, and drops every assumption specific to its origin project (a fixed commit-message trailer format, a single-language commit-body mandate, a companion skill invoked by name, and — most importantly — the source skill's own invocation contract, which treated "do this" as implicit authorization to merge. This canonical version does not inherit that: **merging is a separate, explicitly-gated operation, never implied by a request to deliver a PR.**

## Operations

- **`deliver_pr`** (default): take the task from issue/task identity through an isolated branch, validated changes, and an open, review-ready pull request. This is what "implement issue #42, test it, and open a PR" authorizes — nothing past the PR being opened.
- **`merge`**: actually merge the pull request. This is a separate operation requiring its own explicit intent and a specifically-granted merge permission (not just the general write permission `deliver_pr` needed) — see Safety Contract. A request to deliver a PR never authorizes this on its own, no matter how confident the change looks or how green the checks are.

## When to use / when not

Use this when the caller wants a bounded, already-scoped change carried from "not yet tracked" to "open pull request" — e.g. "implement issue #42 and open a PR", "turn this fix into a PR", "get this change through branch, tests, and a PR." Merge preparation (checking whether a rebase is needed, what checks/reviews are still required) is part of `deliver_pr`; actually merging is not, unless the caller separately asks for that.

Do not use this for read-only git questions, for explaining a concept, or for reviewing an existing PR without also being asked to change something.

## Workflow (`deliver_pr`)

1. **Confirm write capability before creating anything.** Verify the host actually has GitHub write access for this repository (not merely that the user has granted broad permission in a chat UI — a host-level permission grant and an actual provider capability are two different things; see Safety Contract). If write access isn't configured, report exactly what's missing and stop; do not silently fall back to a different account or escalate scope to get access.
2. **Resolve task identity before creating a new branch or commit.** If the caller already supplied a tracking issue (e.g. "issue #42"), read and use that issue — never create a second, duplicate tracking issue for the same work. Only create a new GitHub issue when no tracking issue exists yet and the workflow needs one; give it a short, outcome-focused title and a scope section (what's included, what's excluded) so the issue — not this conversation — is the reference for what "done" means.
3. **Create an isolated branch from the current `origin/main`**, named so it's traceable back to the issue (e.g. `issue/<number>-<short-slug>`). Never implement directly on `main` or a shared branch.
4. **Implement only what the issue's scope covers.** If the work turns out to need more, update the issue's scope or split a follow-up issue — don't silently expand it.
5. **Validate before opening the PR.** Run the tests/checks the change actually needs; a full suite run belongs at the point the candidate is stabilizing, not on every intermediate edit.
6. **Push and open the PR against `main`**, with a body that states the result, what was verified, and (if the host supports it) closes the tracking issue.
7. **Report merge readiness, without merging.** Check whether the branch needs a rebase onto the latest `origin/main`, and report the state of required checks and reviews. If a rebase is needed to keep the PR mergeable, perform it and re-run whichever checks don't already have a fresh pass against the new base — that keeps the *PR* healthy; it is still not a merge.

## Workflow (`merge` — only when explicitly requested, separately from `deliver_pr`)

1. Confirm the PR's required checks and approvals are actually green — do not proceed on a stale or partial status.
2. Merge using the repository's normal PR merge path once every requirement is met — never bypass branch protection or required reviews to force a merge through.

## Safety Contract

- Never implement directly on `main`. Every change goes through an isolated branch and a PR.
- Never use a plain `git push --force`. If a rebase requires updating an already-pushed branch that only this task owns, use `--force-with-lease`, and only after confirming no one else is building on that branch's current tip. Never force-push a shared branch.
- Never rewrite history on `main` or any branch other people are using.
- Do not bypass required status checks, required reviews, or branch-protection rules to complete a merge.
- **`deliver_pr` never merges.** A request to implement, test, and open a PR is not a request to merge it — merging requires its own separate, explicit request.
- **`merge` requires a specifically-granted merge permission, not just the write permission `deliver_pr` needed.** A host-level "allow all" grant, or even a real write-capable GitHub provider, does not by itself authorize merging — treat write access and merge access as two different permissions that must each be actually granted.
- **A host-level "allow all" permission grant is not the same as the GitHub provider actually being writable.** Before treating this skill as usable for a task, confirm an actual write capability from the provider (e.g. `gh` authenticated with write access, or an equivalent connector capability) — not just that the calling UI didn't block the request. A read-only provider must BLOCK, regardless of what the host permission setting says.
- Never create a duplicate tracking issue when the caller already supplied one.
- Report evidence of what was actually verified; do not claim a check passed without having observed its output during this run.
- Coordination with other in-flight work on the same repository is a distinct concern — see `ush-concurrent-edit-coordination` — and only applies when there's actual evidence of overlapping, currently-being-edited implementation source, not merely a shared repository or an open issue.

## Result Contract

- `status`: `completed` or `needs_approval`
- `issue`: number and URL (existing issue reused, or a new one created — state which)
- `branch`: name
- `pr`: number, URL, and whether it is **delivered (open, not merged)** or **merged** — these are always reported as distinct states, never conflated
- `verification`: what was actually run and its result
- `risks`: unresolved conflicts, required approvals still pending, or scope gaps
