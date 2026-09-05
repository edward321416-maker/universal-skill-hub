# claude.ai Projects Adapter

claude.ai Projects does not share local Claude Code repository state — do not
assume it does. The intended strategy is a Project Knowledge / Project
Instructions export bundle generated from the canonical SKILL.md, kept
separate from the Claude Code adapter (`.claude/skills/`) because
claude.ai Projects and Claude Code are different surfaces with different
capabilities.

Not implemented in v1 — see `adapters/chatgpt/README.md` for the same
open item on the export-bundle renderer.
