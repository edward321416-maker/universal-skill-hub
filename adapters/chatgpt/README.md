# ChatGPT / Work Adapter

ChatGPT surfaces do not reliably support automatic native skill installation
today (assumption not verified against a live capability check — treat as
unconfirmed either way). Per `registry/compatibility.json`, the default
strategy for this platform is `instruction_export`: a plain-instructions
bundle derived from the canonical SKILL.md, for the user to paste into a
Custom GPT / Project instructions, rather than a native skill directory.

No export bundle has been generated in v1 — `scripts/render-adapters.mjs`
currently only targets platforms with a filesystem skill directory convention
(codex, claude-code, cursor, opencode). Extending it to emit an
instruction-export bundle for chatgpt/claude-ai is future work.
