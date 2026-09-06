---
name: ush-work-announcement
description: Build a concise development announcement from actual repository history for a selected period, domain, and contributor, and only publish the exact approved text after explicit user approval. Use to draft a whole-project or filtered (e.g. one contributor's or one domain's) development update backed by merged Git work. Do not use for speculative plans, work that isn't yet reflected in the repository, or to publish anything the user hasn't seen and approved in its final form.
metadata:
  scope: domain
  risk: L0
  status: EXPERIMENTAL
  version: 1.1.0
  source_repo: https://github.com/openbaeseongjin/baeseongjin
  source_path: .codex/skills/work-announcement/SKILL.md
  source_commit: a8bc0493355b82582e98ec4ffc8064506f8f422a
---

# Work Announcement

Turn work already reflected in the repository into a concise, reviewable announcement. The repository is the evidence source; a chat channel is only the approved publication destination — never the other way around. This is a generalization of a project-specific skill; it keeps the evidence discipline and the draft-before-publish gate, and drops the assumption that the destination must be Discord specifically or that a fixed set of document filenames exists.

## Operations

- **`draft`** (default): build the announcement text from repository evidence and show it for review. Never sends anything.
- **`publish`**: send the exact, already-approved text to a specific, already-identified destination — Discord, or any other message channel the host supports (Slack, Teams, email, etc.); this skill's publish path is destination-agnostic, requiring a generic message-sending capability rather than one tied to Discord specifically. This is a separate, explicitly-gated operation — a draft request never authorizes publication on its own, and neither does a wording tweak, a scope adjustment, or a request to add timestamps. **Any material edit to the text after approval invalidates that approval, enforced deterministically by comparing a hash of the approved text against the text about to be sent** — a new approval is required before publishing the edited version.

## Scope resolution

Resolve three independent filters before drafting:

- **Period:** an explicit start and end. Convert relative phrases ("since yesterday") into concrete dates in the project's local time zone.
- **Domain:** all development by default, or a requested area (e.g. graphics, gameplay, multiplayer, tooling, docs). Classify from changed paths, symbols, and commit content — not the subject line alone.
- **Contributor:** all contributors by default, or one person's actual authored work, resolved from real commit authorship — not from whoever happened to run the merge.

State the resolved period, domain, and contributor in the draft itself so the reader can catch a wrong scope immediately. If a filter yields zero matching work, say so plainly instead of forcing an announcement out of unrelated material.

## Repository evidence

1. Read the project's own policy or decision documents as needed to check whether a claim is still current — don't assume specific filenames.
2. Read merge history within the selected period; for each merge, inspect the underlying feature commit's author, changed paths, and stated verification.
3. Include a direct (non-merge) commit only when it materially changes the announced result.
4. Compare selected work against current canonical documents; describe superseded work as a transition rather than presenting it as the current state.
5. Never treat uncommitted files, commit subject lines alone, or chat discussion as proof that work is done — only actual merged/committed evidence counts.

## Draft shape

Lead with the resolved scope and the count of relevant merges/commits. Group by outcome rather than listing every commit. Prioritize shipped changes and user-visible fixes over minor internal detail, but do not omit a meaningful bug fix just to shorten the announcement. Use human-facing language.

## Safety Contract

- `draft` never performs an external write. Building or revising the draft text is always safe to do freely.
- `publish` requires: the exact final text was shown to and explicitly approved by the user, the destination is unambiguous, and an actual generic message-send capability and a specifically-granted send permission are present for this task — not merely a host-level "go ahead," and not merely a Discord-specific capability if this deployment publishes elsewhere.
- Any material change to the announcement text after approval resets that approval; publish the previously-approved text only, or get a fresh approval for the edited version. This is enforced as part of the deterministic gate itself (a hash comparison), not left to the caller to remember.
- Never fabricate accomplishments not backed by repository evidence.
- Never expose author email addresses, private identifiers, tokens, or raw operational logs in the announcement or in this skill's own output.
- Never edit, delete, moderate, or crosspost existing chat content — the only permitted write is sending the one approved announcement.

## Result Contract

- `status`: `completed` or `needs_approval`
- `draft`: the exact proposed text, with the resolved period/domain/contributor stated
- `evidenceCount`: number of merges/commits the draft is based on
- `verification`: what was checked to confirm the draft's claims
- `risks`: scope ambiguity, zero-match filters, or evidence gaps
