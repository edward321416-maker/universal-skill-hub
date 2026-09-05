# ChatGPT / Work Adapter

Verified 2026-09-05 directly against OpenAI's own skills documentation
(`learn.chatgpt.com/docs/build-skills`, the canonical redirect target of
`developers.openai.com/codex/skills`). That page distinguishes exactly two
distribution surfaces, in its own words:

- **"Standalone skills are available in the ChatGPT desktop app, Codex CLI,
  and IDE extension."**
- **"Skills bundled in plugins are also available in Chat and Work across
  ChatGPT on the web, desktop, and mobile."**

Separately, `developers.openai.com/api/reference/resources/skills` documents
a third, distinct resource: the **OpenAI API "project Skills"** endpoint
(`skills.versions.create`, with `version`/`default_version`, directory or
ZIP upload, immutable versions). This is not mentioned on the
`build-skills` page and is a separate surface from both of the above.

Status, using only the terminology actually confirmed above (no invented
phrasing like "Personal Skills" or "Plugin Directory upload" — that wording
came from secondary/aggregator sources during an earlier pass and did not
hold up against the primary source, so it has been removed):

| Surface | Status in this repo |
|---|---|
| Standalone Skills (ChatGPT desktop app, Codex CLI, Codex IDE extension) | Codex CLI: filesystem distribution IMPLEMENTED (`scripts/install-skills.mjs`, verified against a real local install — see `docs/DESIGN.md`). ChatGPT desktop app / Codex IDE extension: capability VERIFIED to exist per the quote above; no distribution mechanism implemented in this repo for either |
| Skills bundled in plugins (Chat/Work, ChatGPT web/desktop/mobile) | NOT IMPLEMENTED in Phase 1.1. No plugin-packaging format was found in the documentation consulted beyond what's quoted above; expanding into it is deferred rather than guessed at |
| OpenAI API project Skills | IMPLEMENTED: `scripts/bundle-openai.mjs` builds a deterministic ZIP matching this resource's documented upload shape and size/file-count limits. No API key is used and no upload is performed — a human would call `skills.versions.create` themselves |
| Automatic Hub -> ChatGPT-account or Hub -> OpenAI-API-project sync | NOT IMPLEMENTED and NOT CLAIMED. Any upload into a specific account/project is always a manual, human-initiated action; nothing in this repo performs it, and it requires no credential this repo would ever hold |

Do not read "Standalone Skills... Codex CLI" as claiming this repo produces
a ChatGPT-plugin package — it does not. The only ChatGPT/OpenAI-facing
artifact this repo builds today is the OpenAI API project-Skills ZIP.
