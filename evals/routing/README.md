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

## Phase 1.3 live evidence (2026-09-06)

Two independently-scored, non-combinable evidence populations exist under
this directory — see `docs/DESIGN.md`'s Phase 1.3 section for the full
methodology:

- **Codex** (`phase-1.3-real-environment-cases.json`, `phase-1.3-project-scoped-cases.json`,
  scored by `scripts/routing-eval.mjs` / `npm run routing-eval`): uses
  `modelVisible` to separate a genuine context-budget reachability failure
  from an ordinary semantic false negative.
- **Cursor** (`phase-1.3-cursor-cases.json`, scored by
  `scripts/cursor-routing-eval.mjs` / `npm run routing-eval:cursor`): uses a
  different field, `selectionEvidence` (`CONFIRMED`/`UNCONFIRMED`/`NOT_TESTED`),
  because Cursor's uncertainty is a different kind of thing — the Cursor
  Agent CLI's own narrative can claim skill usage ("Using ush-...") with no
  corroborating directly-observable runtime event (a `readToolCall` on the
  exact `~/.cursor/skills/<id>/SKILL.md` path). These two fields are
  deliberately not unified, and neither evaluator's precision/recall is ever
  combined with the other's.

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
