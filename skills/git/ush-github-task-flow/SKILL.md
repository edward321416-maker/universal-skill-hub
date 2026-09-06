---
name: ush-github-task-flow
description: Carry a bounded implementation task through a GitHub issue, an isolated branch, validated changes, and a pull request, using GitHub as the source-of-truth history for the work. Use when asked to implement an issue and open a PR, carry a repository task through branch/test/PR, or prepare a safe GitHub task workflow for existing work. Do not use for pure git-concept questions ("what is git rebase?"), for inspecting a commit without changing anything, or for reviewing a PR without also being asked to change it.
metadata:
  scope: global
  risk: L3
  status: EXPERIMENTAL
  version: 1.0.0
  source_repo: https://github.com/openbaeseongjin/baeseongjin
  source_path: .codex/skills/github-task-flow/SKILL.md
  source_commit: 4b8cf8b0faa7e1d7dc195984dcb66fc468b3157f
---

# GitHub Task Flow

Use a GitHub issue as the record of what is being done and deliver it through a pull request. This is a generalization of a project-specific skill: it keeps the safety-critical sequencing and force-push discipline, and drops every assumption specific to its origin project (a fixed commit-message trailer format, a single-language commit-body mandate, and a companion skill invoked by name).

## When to use / when not

Use this when the caller wants a bounded, already-scoped change carried all the way from "not yet tracked" to "open pull request" — e.g. "implement issue #42 and open a PR", "turn this fix into a PR", "get this change through branch, tests, and a PR."

Do not use this for read-only git questions, for explaining a concept, or for reviewing an existing PR without also being asked to change something.

## Workflow

1. **Confirm write capability before creating anything.** Verify the host actually has GitHub write access for this repository (not merely that the user has granted broad permission in a chat UI — a host-level permission grant and an actual provider capability are two different things; see Safety Contract). If write access isn't configured, report exactly what's missing and stop; do not silently fall back to a different account or escalate scope to get access.
2. **Create the GitHub issue before the branch or any commit.** Give it a short, outcome-focused title, and a scope section (what's included, what's excluded) so the issue — not this conversation — is the reference for what "done" means.
3. **Create an isolated branch from the current `origin/main`**, named so it's traceable back to the issue (e.g. `issue/<number>-<short-slug>`). Never implement directly on `main` or a shared branch.
4. **Implement only what the issue's scope covers.** If the work turns out to need more, update the issue's scope or split a follow-up issue — don't silently expand it.
5. **Validate before opening the PR.** Run the tests/checks the change actually needs; a full suite run belongs at the point the candidate is stabilizing, not on every intermediate edit.
6. **Push and open the PR against `main`**, with a body that states the result, what was verified, and (if the host supports it) closes the tracking issue.
7. **Before merge, sync with the latest `main`.** Rebase the branch onto current `origin/main`, resolve conflicts within the issue's own scope (never discard unrelated work to make a conflict go away), and re-run whichever checks don't already have a fresh pass against the new base.
8. **Merge using the repository's normal PR merge path** once required checks and approvals are green — never bypass branch protection or required reviews to force a merge through.

## Safety Contract

- Never implement directly on `main`. Every change goes through an isolated branch and a PR.
- Never use a plain `git push --force`. If a rebase requires updating an already-pushed branch that only this task owns, use `--force-with-lease`, and only after confirming no one else is building on that branch's current tip. Never force-push a shared branch.
- Never rewrite history on `main` or any branch other people are using.
- Do not bypass required status checks, required reviews, or branch-protection rules to complete a merge.
- **A host-level "allow all" permission grant is not the same as the GitHub provider actually being writable.** Before treating this skill as usable for a task, confirm an actual write capability from the provider (e.g. `gh` authenticated with write access, or an equivalent connector capability) — not just that the calling UI didn't block the request. A read-only provider must BLOCK, regardless of what the host permission setting says.
- Report evidence of what was actually verified; do not claim a check passed without having observed its output during this run.
- Coordination with other in-flight work on the same repository is a distinct concern — see `ush-concurrent-edit-coordination` — and only applies when there's actual evidence of overlapping, currently-being-edited implementation source, not merely a shared repository or an open issue.

## Result Contract

- `status`: `completed` or `needs_approval`
- `issue`: number and URL
- `branch`: name
- `pr`: number and URL
- `verification`: what was actually run and its result
- `risks`: unresolved conflicts, required approvals still pending, or scope gaps
