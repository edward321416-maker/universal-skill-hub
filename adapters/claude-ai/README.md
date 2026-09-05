# claude.ai Projects Adapter

Verified 2026-09-05 against Anthropic's own documentation
(support.claude.com "How to create custom skills", platform.claude.com
Agent Skills docs): claude.ai supports **Custom Skills** on Pro/Max/Team/
Enterprise plans with code execution enabled, uploaded as a ZIP via
Settings > Features (or Customize > Skills). The required shape: "Create a
ZIP file of the folder, where the ZIP should contain the skill folder as its
root (not a subfolder)." Enterprise Owners can also provision a skill
organization-wide; individual users cannot.

`scripts/bundle-claude-ai.mjs` builds exactly that ZIP shape deterministically
from a skill's canonical source (`npm run bundle:claude-ai`). It does not
upload anything and requires no credential — a human uploads the resulting
`dist/bundles/claude-ai/<skill_id>.zip` themselves.

claude.ai Projects still does not share local Claude Code repository
state — that assumption is not made anywhere in this hub. This bundle
generator is the extent of claude.ai support in this repo; no numeric
size/file-count limit specific to claude.ai was found in the documentation
consulted, so none is invented or enforced here (contrast with
`scripts/bundle-openai.mjs`, which does enforce documented OpenAI API
limits).
