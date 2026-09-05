# ChatGPT / Work Adapter

Verified 2026-09-05 against OpenAI's own documentation (developers.openai.com,
via its learn.chatgpt.com redirect target, plus corroborating third-party
coverage): ChatGPT (Business/Enterprise/Healthcare/Edu, and paid Work plans)
has a native **Personal Skills** feature, reachable from the Plugin
Directory, that uses the same `SKILL.md`-based Agent Skills format this hub
already produces. A skill can be uploaded from a local folder/zip or
imported from a source like GitHub. ChatGPT scans an uploaded skill and
approves most of them automatically, flagging some for review.

Three distinct things must not be conflated:

1. **Bundle generation** (`scripts/bundle-openai.mjs` targets the separate
   OpenAI API "project Skills" resource, not the ChatGPT product directly —
   see below) — implemented, tested, verified against official docs.
2. **Native ChatGPT Skill capability** (the product feature described
   above) — verified to exist; this hub does not yet generate a
   ChatGPT-Plugin-Directory-specific bundle distinct from the generic
   claude.ai/OpenAI-API bundle shape, since no ChatGPT-specific packaging
   requirement beyond "a folder/zip containing SKILL.md" was found in the
   documentation consulted.
3. **Automatic Hub -> ChatGPT account sync** — NOT implemented and not
   claimed. Uploading a skill into a specific user's ChatGPT account is
   always a manual, human-initiated action; nothing in this repo performs
   it, and it requires no credential this repo would ever hold.

Separately, the **OpenAI API** exposes its own "project Skills" resource
(`developers.openai.com/api/docs/guides/tools-skills`), distinct from both
the ChatGPT product and the Codex CLI filesystem convention. This is what
`scripts/bundle-openai.mjs` targets: it builds a deterministic ZIP (skill
folder at the archive root, per that API's own upload contract) with no API
key required to *build* it — only to actually call
`skills.versions.create`, which this repo does not do.
