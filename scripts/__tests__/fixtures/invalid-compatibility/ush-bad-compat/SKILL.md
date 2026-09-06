---
name: ush-bad-compat
description: Fixture where compatibility is an object instead of the spec-required string.
compatibility:
  requires: read_files
metadata:
  scope: global
  risk: L0
  status: EXPERIMENTAL
  version: 0.1.0
---

# Bad Compatibility Fixture (wrong type)

The Agent Skills spec requires `compatibility` to be a plain string (max 500
characters), not an object. Hub-specific structured capability data belongs
in registry/compatibility.json, never in SKILL.md frontmatter.
