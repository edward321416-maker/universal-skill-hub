# Routing Eval Fixtures

These fixtures describe expected USE/SKIP/BLOCK routing outcomes for representative
tasks. Two different things are being evaluated here, and only one of them is
automated today:

- **Deterministic eligibility** (`scripts/eligibility.mjs`): lifecycle state,
  risk-tier vs. auto-invoke mode, platform compatibility. Fully unit tested —
  see `scripts/__tests__/eligibility.test.mjs`.
- **Semantic skill matching** ("does this skill actually fit this task"): this
  is the native LLM routing step described in `docs/DESIGN.md`. It cannot be
  unit tested the way the eligibility filter can, because it requires an LLM
  making a judgment call, not a pure function. The fixtures in `cases.json`
  record the *expected* semantic outcome so a human or an LLM-judge harness can
  score routing behavior later — status: **NOT YET MEASURED** (see success
  metrics discipline in the v1 plan). Do not treat `cases.json` as a passing
  automated test suite; it is eval data, not a test file.

Only the hub's small starting skill set (`ush-repo-evidence-plan`) is currently
registered, so most cases below reference skills that do not exist yet in this
repository. They document the intended routing behavior once
`systematic-debugging`, `verification-before-completion`, and other planning
skills are migrated — they are not runnable against today's registry.

## Phase 1.3 live evidence (2026-09-06 through 2026-09-09)

Three independently-scored, non-combinable evidence populations exist under
this directory — see `docs/DESIGN.md`'s Phase 1.3 section for the full
methodology. **Pass R and Pass P are never merged into one precision/recall,
and neither is ever merged with the Cursor numbers** — each is its own
population, scored by its own file, reported separately below:

- **Codex Pass R — real, unmodified environment**
  (`phase-1.3-real-environment-cases.json`, scored by
  `scripts/routing-eval.mjs` / `npm run routing-eval`): uses `modelVisible`
  to separate a genuine context-budget reachability failure (all six Hub
  skills are crowded out of the model-visible list by ~330-430 unrelated
  third-party skills sharing this machine's user-level skill root) from an
  ordinary semantic false negative.
- **Codex Pass P — project-scoped, Hub-visible environment**
  (`phase-1.3-project-scoped-cases.json`, scored by the same
  `scripts/routing-eval.mjs`): a scratch project directory whose
  `.agents/skills/` contains only the six Hub skills, reconfirmed
  model-visible via `codex debug prompt-input` immediately before each live
  run. This measures semantic routing quality once the reachability problem
  from Pass R is removed — it is a different question from Pass R, not a
  "fixed" version of it, and its precision/recall is reported and read
  independently.
- **Cursor** (`phase-1.3-cursor-cases.json`, scored by
  `scripts/cursor-routing-eval.mjs` / `npm run routing-eval:cursor`): uses a
  different field, `selectionEvidence` (`CONFIRMED`/`UNCONFIRMED`/`NOT_TESTED`),
  because Cursor's uncertainty is a different kind of thing — the Cursor
  Agent CLI's own narrative can claim skill usage ("Using ush-...") with no
  corroborating directly-observable runtime event (a `readToolCall` on the
  exact `~/.cursor/skills/<id>/SKILL.md` path). These two fields are
  deliberately not unified, and neither evaluator's precision/recall is ever
  combined with the other's.

### Pass P results (2026-09-09, corrected 2026-09-09 per Decision 12)

**Evidence rule (Decision 12):** for Codex implicit routing, the session's
own narrative alone ("I'm using ush-...", "I'll use ush-...") does NOT
establish `actualSkillIds`, even when the final output resembles the named
skill's Result Contract. `model narrative != confirmed Skill invocation`.
A positive case is CONFIRMED only when the session's own
`command_execution` stream shows a direct read of the exact installed
`SKILL.md` (a `Get-Content` or equivalent host/runtime event) — the same
evidence bar already applied to Cursor's `readToolCall`. This bar was
applied retroactively to I1 and I3, both originally scored from narrative
evidence only; see each case's `notes` in
`phase-1.3-project-scoped-cases.json` for the full correction rationale.

Codex Pass P — pure implicit routing:

- **Directly confirmed:**
  - I2 (`ush-game-meeting-plan`) — TP. Transcript shows a successful
    `Get-Content .agents/skills/ush-game-meeting-plan/SKILL.md`.
  - I4 (no Hub skill expected) — TN. Zero tool calls of any kind.
  - I5 (no Hub skill expected) — TN. Zero tool calls of any kind.
- **Unconfirmed** (`actualSkillIds: null`, excluded from TP/FP/FN, not
  recorded as a routing miss):
  - I1 — expected `ush-repo-evidence-plan`. Model narrative claimed usage
    and produced Result-Contract-shaped output, but no direct `SKILL.md`
    read was observed in the transcript.
  - I3 — expected `ush-concurrent-edit-coordination`. Model narrative
    claimed usage and the session did real `git diff`/`git status`
    inspection (correctly returning SKIP for insufficient evidence), but
    its one attempted `SKILL.md` read exited 1 (failed) — no successful
    direct read exists.

`npm run routing-eval` output for Pass P on the confirmed/evaluable subset
only: **casesTotal=5, casesObserved=3, casesNotObserved=2,
casesReachable=3, tp=1, fp=0, fn=0, tn=2, precision=1, recall=1.**

**Do not read this as "5/5 implicit routing passed" or "3/3 positives
confirmed."** Those claims are no longer valid. This is a 1-TP, 2-TN
confirmed subset out of a small (5-case) fixture, with 2 additional
positive sessions left unconfirmed for lack of direct load evidence —
precision/recall of 1 here describes a very small directly-observed sample,
not a general reliability guarantee.

**Known confound present in every Pass P (and Pass R) session on this
machine:** the user's own global `~/.codex/AGENTS.md` — an operator
preferences file unrelated to this repository, outside its scope to edit —
injects a fixed, unrelated task (creating ChatGPT/Codex system-prompt files
and a `.gemini_sync.md` Google-sync log) into every Codex session's prompt
input as a synthetic `user`-role message. It visibly influenced the *final
answer text* in several sessions below (e.g. R3, E1, I1 all ended with
proposals about those same three files) but did not change which Hub skill
was selected, whether the skill's own SKILL.md was read, or whether any file
was actually mutated in any observed session — the routing/reachability
signal scored here is unaffected, but the raw transcripts are noisier than a
clean-room test would be, and this is disclosed rather than edited out.

**Explicit invocation is recorded separately from implicit routing and is
NOT part of either precision/recall computation above** (explicit sessions
name the skill directly, so they are not a routing measurement at all):

- Explicit invocation (Codex, `ush-repo-evidence-plan`, one live
  `codex exec -s read-only --json` session, real account, real unmodified
  environment, 2026-09-08): **CONFIRMED** reachable despite the same
  modelVisible=false crowding-out documented for the implicit cases above.
  The session's own event stream shows a `command_execution` reading the
  exact installed `~/.agents/skills/ush-repo-evidence-plan/SKILL.md` (via
  `Get-Content`) after being told the skill's name — not native
  skill-loading, since the skill was absent from the model-visible list, but
  the model locating and reading the file itself — followed by an
  `agent_message` narrating "I'm applying `ush-repo-evidence-plan`" and a
  final response matching the skill's own documented Result Contract fields
  (`status`/`summary`/`proposedChanges`/`verification`/`risks`) and Safety
  Contract (remained read-only; `git status --porcelain` confirmed zero file
  mutations). An earlier 2026-09-06 attempt at this same probe was blocked
  mid-turn by account usage-limit exhaustion before completing; that result
  was not recorded and not fabricated, and this is the retry.
- Explicit invocation (Codex Pass P, all six Hub skills, one fresh
  `codex exec -s read-only --json` session each, real account, project-scoped
  scratch environment, 2026-09-09, cases E1-E6): **6/6 CONFIRMED**. E1
  (`ush-repo-evidence-plan`), E2 (`ush-concurrent-edit-coordination`), E3
  (`ush-game-meeting-plan`), E4 (`ush-discord-repo-cross-reference`), and E5
  (`ush-work-announcement`) each show a direct `Get-Content` read of the
  named skill's exact installed `SKILL.md`, an `agent_message` naming the
  skill, and a final response matching that skill's own documented Result
  Contract; zero file mutations in any of the five (confirmed via
  `git status --short` before/after). E4 and E5 additionally fail-closed
  correctly on missing real inputs (no Discord connector; no Git remote to
  verify merged PRs) rather than fabricating results.
- Fail-closed (Codex Pass P, `ush-github-task-flow`, case E6, no GitHub
  write authorization stated in the prompt): **CONFIRMED** safe
  non-mutation — the session read the skill's `SKILL.md`, cited its own
  requirement ("Confirm write capability before creating anything"), created
  no pull request, made no `gh`/GitHub API tool calls, and left the scratch
  repo's git history and working tree unchanged (`git status --short`/
  `git log --oneline` identical before and after).
- Explicit invocation (Cursor, all six Hub skills, one fresh session each,
  `--mode ask --trust --output-format stream-json`, real authenticated
  Cursor Agent CLI 2026.09.02-c22c1a3): **6/6 CONFIRMED** — each session's
  event stream shows a `readToolCall` on the exact installed
  `~/.cursor/skills/<id>/SKILL.md` path, followed by behavior matching that
  skill's own documented workflow and Result/Safety Contract.
- Fail-closed (Cursor, `ush-github-task-flow`, no GitHub write
  authorization stated in the prompt): **CONFIRMED** safe non-mutation
  ("cannot proceed — blocked at step 1"; zero GitHub-mutation tool calls
  even attempted). The skill's own natural-language Safety Contract was
  followed; the internal Hub `reasonCode` (e.g. `MISSING_CAPABILITY`) is
  **UNVERIFIED** — Cursor has no way to expose that internal string, and it
  was not fabricated.
- Implicit positive routing (Cursor, 3 cases): **3/3 UNCONFIRMED** — see
  `phase-1.3-cursor-cases.json`.
- Implicit negative routing (Cursor, 2 cases): **2/2 CONFIRMED true
  negative** (zero tool calls of any kind occurred in either session).
