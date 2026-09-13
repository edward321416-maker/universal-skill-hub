# Simple Codex setup

For the normal ORCA + Codex workflow, setup is intentionally two steps.

## Once per computer

From a trusted `universal-skill-hub` checkout:

```powershell
git checkout main
git pull
npm ci
npm link
```

`npm link` exposes the local `ush` command. Re-run it only if the local npm link is removed.

## Once per project/worktree

Open a terminal anywhere inside the Git worktree that Codex is actually using and run:

```powershell
ush prepare
```

That command automatically finds the Git root, uses the Codex project-local `.agents/skills` convention, and prepares only the conservative read/evidence default (`ush-repo-evidence-plan`). It creates no context JSON and requires no absolute paths.

Then start a fresh Codex session and work normally. You do not need to mention the Skill ID in task prompts.

## Safety boundary

`ush prepare` does not grant GitHub writes, merge/send/publish permission, or any L3/L4 task authorization. It does not inspect or clean global/third-party Skills. If the project already has a broader Hub-managed scope that would require removals, the simple command refuses and points the operator to the advanced `prepare-project` flow instead of silently shrinking the project.

Re-running `ush prepare` is safe: an unchanged project reports `Already prepared` and keeps canonical Skill bytes unchanged.

For custom policies, additional Skills, Claude Code, or reviewed removals, use the advanced flow in [Prepare project Skills](project-skill-prepare.md).
